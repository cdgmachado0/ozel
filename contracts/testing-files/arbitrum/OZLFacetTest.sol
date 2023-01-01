// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.14;


import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import { LibDiamond } from "../../libraries/LibDiamond.sol";
import { ITri } from '../../interfaces/arbitrum/ICurve.sol';
import { ModifiersARB } from '../../arbitrum/Modifiers.sol';
import '../../arbitrum/facets/oz4626Facet.sol';
import '../../interfaces/arbitrum/IYtri.sol';
import '../../interfaces/common/IWETH.sol';
import '../../libraries/LibCommon.sol';
import './ExecutorFacetTest.sol';
import '../../Errors.sol';



contract OZLFacetTest is ModifiersARB { 

    using SafeERC20 for IERC20;
    using Address for address;

    event NewToken(address token); 
    event DeadVariables(bool isRetry);
 

    function exchangeToAccountToken(
        AccountConfig calldata accountDetails_
    ) external payable noReentrancy(0) filterDetails(accountDetails_) { 
        if (msg.value <= 0) revert CantBeZero('msg.value');

        if (s.failedFees > 0) _depositFeesInDeFi(s.failedFees, true);

        IWETH(s.WETH).deposit{value: msg.value}();
        uint wethIn = IWETH(s.WETH).balanceOf(address(this));
        wethIn = s.failedFees == 0 ? wethIn : wethIn - s.failedFees;

        //Mutex bitmap lock
        _toggleBit(1, 0);

        //Deposits in oz4626Facet
        bytes memory data = abi.encodeWithSignature(
            'deposit(uint256,address,uint256)', 
            wethIn, accountDetails_.user, 0
        );

        LibDiamond.callFacet(data);

        (uint netAmountIn, uint fee) = _getFee(wethIn);

        uint baseTokenOut = 
            accountDetails_.token == s.WBTC || accountDetails_.token == s.renBTC ? 1 : 0;

        //Swaps WETH to token (Base: USDT-WBTC / Route: MIM-USDC-renBTC-WBTC) 
        _swapsForBaseToken(
            netAmountIn, baseTokenOut, accountDetails_
        );
      
        uint toUser = IERC20(accountDetails_.token).balanceOf(address(this));
        if (toUser > 0) IERC20(accountDetails_.token).safeTransfer(accountDetails_.user, toUser);

        _depositFeesInDeFi(fee, false);
    }


    function _swapsForBaseToken(
        uint amountIn_, 
        uint baseTokenOut_, 
        AccountConfig memory accountDetails_
    ) private { 
        IERC20(s.WETH).approve(s.tricrypto, amountIn_);

        uint minOut = ITri(s.tricrypto).get_dy(2, baseTokenOut_, amountIn_);
        uint slippage = ExecutorFacetTest(s.executor).calculateSlippage(minOut, accountDetails_.slippage);
        
        ITri(s.tricrypto).exchange(2, baseTokenOut_, amountIn_, slippage, false);  
        uint baseBalance = IERC20(baseTokenOut_ == 0 ? s.USDT : s.WBTC).balanceOf(address(this));

        if ((accountDetails_.token != s.USDT && accountDetails_.token != s.WBTC) && baseBalance > 0) { 
            _tradeWithExecutor(accountDetails_); 
        }
    }


    function withdrawUserShare(
        AccountConfig memory accountDetails_,
        address receiver_,
        uint shares_
    ) external onlyWhenEnabled filterDetails(accountDetails_) { 
        if (receiver_ == address(0)) revert CantBeZero('address');
        if (shares_ <= 0) revert CantBeZero('shares');

        //Queries if there are failed fees. If true, it deposits them
        if (s.failedFees > 0) _depositFeesInDeFi(s.failedFees, true);

        //Mutex bitmap lock
        _toggleBit(1, 3);

        bytes memory data = abi.encodeWithSignature(
            'redeem(uint256,address,address,uint256)', 
            shares_, receiver_, accountDetails_.user, 3
        );

        data = LibDiamond.callFacet(data);

        uint assets = abi.decode(data, (uint));
        IYtri(s.yTriPool).withdraw(assets);

        //tricrypto= USDT: 0 / crv2- USDT: 1 , USDC: 0 / mim- MIM: 0 , CRV2lp: 1
        uint tokenAmountIn = ITri(s.tricrypto).calc_withdraw_one_coin(assets, 0); 
        
        uint minOut = ExecutorFacetTest(s.executor).calculateSlippage(
            tokenAmountIn, accountDetails_.slippage
        ); 

        ITri(s.tricrypto).remove_liquidity_one_coin(assets, 0, minOut);

        _tradeWithExecutor(accountDetails_); 

        uint userTokens = IERC20(accountDetails_.token).balanceOf(address(this));
        IERC20(accountDetails_.token).safeTransfer(receiver_, userTokens); 
    } 
    

    function _depositFeesInDeFi(uint fee_, bool isRetry_) private { 
        emit DeadVariables(isRetry_);

        //Deposit WETH in Curve Tricrypto pool
        (uint tokenAmountIn, uint[3] memory amounts) = _calculateTokenAmountCurve(fee_);
        IERC20(s.WETH).approve(s.tricrypto, tokenAmountIn);

        uint minAmount = ExecutorFacetTest(s.executor).calculateSlippage(tokenAmountIn, s.defaultSlippage);
        ITri(s.tricrypto).add_liquidity(amounts, minAmount);
            
        //Deposit crvTricrypto in Yearn
        IERC20(s.crvTricrypto).approve(s.yTriPool, IERC20(s.crvTricrypto).balanceOf(address(this))); 
        IYtri(s.yTriPool).deposit(IERC20(s.crvTricrypto).balanceOf(address(this)));

        //Internal fees accounting
        if (s.failedFees > 0) s.failedFees = 0;
        s.feesVault += fee_;
    }


    function addTokenToDatabase(TradeOps memory newSwap_) external { 
        LibDiamond.enforceIsContractOwner();
        s.tokenDatabase[newSwap_.token] = true;
        s.swaps.push(newSwap_);
        emit NewToken(newSwap_.token);
    }

    function removeTokenFromDatabase(TradeOps memory swapToRemove_) external {
        LibDiamond.enforceIsContractOwner();
        if(!s.tokenDatabase[swapToRemove_.token]) revert TokenNotInDatabase(swapToRemove_.token);

        s.tokenDatabase[swapToRemove_.token] = false;
        LibCommon.remove(s.swaps, swapToRemove_);
    }


    /*******
        Helper functions
     ******/

    function _getFee(uint amount_) private view returns(uint, uint) {
        uint fee = amount_ - ExecutorFacetTest(s.executor).calculateSlippage(amount_, s.protocolFee);
        uint netAmount = amount_ - fee;
        return (netAmount, fee);
    }

    function _tradeWithExecutor(AccountConfig memory accountDetails_) private { 
        _toggleBit(1, 2);
        uint length = s.swaps.length;

        for (uint i=0; i < length;) {
            if (s.swaps[i].token == accountDetails_.token) {
                bytes memory data = abi.encodeWithSignature(
                    'executeFinalTrade((int128,int128,address,address,address),uint256,address,uint256)', 
                    s.swaps[i], accountDetails_.slippage, accountDetails_.user, 2
                );

                LibDiamond.callFacet(data);
                break;
            }
            unchecked { ++i; }
        }
    }

    function _calculateTokenAmountCurve(uint wethAmountIn_) private view returns(uint, uint[3] memory) {
        uint[3] memory amounts;
        amounts[0] = 0;
        amounts[1] = 0;
        amounts[2] = wethAmountIn_;
        uint tokenAmount = ITri(s.tricrypto).calc_token_amount(amounts, true);
        return (tokenAmount, amounts);
    }
}





