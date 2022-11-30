// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.14; 


import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '@rari-capital/solmate/src/utils/ReentrancyGuard.sol';
import '@rari-capital/solmate/src/utils/SafeTransferLib.sol';
import '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '../interfaces/DelayedInbox.sol';
import '../interfaces/ozIPayMe.sol';
import './ozUpgradeableBeacon.sol';
import '../interfaces/IWETH.sol';
import '../interfaces/IOps.sol';
import './FakeOZL.sol';
import './Emitter.sol';
import '../Errors.sol';



/**
 * @title Responsible for sending ETH and calldata to L2
 * @notice Sends the ETH an account just received plus its details to L2 for swapping.
 * It also implements the emergency swap in L1 in case it's not possible to bridge. 
 */
contract ozPayMe is ozIPayMe, ReentrancyGuard, Initializable { 

    using FixedPointMathLib for uint;

    StorageBeacon.AccountConfig accountDetails;
    StorageBeacon.FixedConfig fxConfig;

    address private _beacon;

    event FundsToArb(address indexed sender, uint amount);
    event EmergencyTriggered(address indexed sender, uint amount);
    event NewUserToken(address indexed user, address indexed newToken);
    event NewUserSlippage(address indexed user, uint indexed newSlippage);

    /*///////////////////////////////////////////////////////////////
                              Modifiers
    //////////////////////////////////////////////////////////////*/

    /// @dev Checks that only Gelato's PokeMe can make the call
    modifier onlyOps() {
        if (msg.sender != fxConfig.ops) revert NotAuthorized(msg.sender);
        _;
    }

    modifier onlyUser() {
        if (msg.sender != accountDetails.user) revert NotAuthorized(msg.sender);
        _;
    }

    modifier checkToken(address newUserToken_) {
        StorageBeacon storageBeacon = StorageBeacon(_getStorageBeacon(_beacon, 0)); 
        if (newUserToken_ == address(0)) revert CantBeZero('address');
        if (!storageBeacon.queryTokenDatabase(newUserToken_)) revert TokenNotInDatabase(newUserToken_);
        _;
    }

    modifier checkSlippage(uint newSlippageBasisPoint_) {
        if (newSlippageBasisPoint_ < 1) revert CantBeZero('slippage');
        _;
    }

    /*///////////////////////////////////////////////////////////////
                            Main functions
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ozIPayMe
    function sendToArb( 
        uint gasPriceBid_,
        StorageBeacon.AccountConfig calldata accountDetails_
    ) external payable onlyOps {    
        StorageBeacon storageBeacon = StorageBeacon(_getStorageBeacon(_beacon, 0)); 

        if (bytes(accountDetails_.accountName).length == 0) revert CantBeZero('accountName'); 
        if (bytes(accountDetails_.accountName).length > 18) revert NameTooLong();
        if (accountDetails_.user == address(0) || accountDetails_.userToken == address(0)) revert CantBeZero('address');
        if (!storageBeacon.isUser(accountDetails_.user)) revert UserNotInDatabase(accountDetails_.user);
        if (!storageBeacon.queryTokenDatabase(accountDetails_.userToken)) revert TokenNotInDatabase(accountDetails_.userToken);
        if (accountDetails_.userSlippage <= 0) revert CantBeZero('slippage');
        if (!(address(this).balance > 0)) revert CantBeZero('contract balance');

        (uint fee, ) = IOps(fxConfig.ops).getFeeDetails();
        _transfer(fee, fxConfig.ETH);

        bool isEmergency = false;

        bytes memory swapData = abi.encodeWithSelector(
            FakeOZL(payable(fxConfig.OZL)).exchangeToUserToken.selector, 
            accountDetails_
        );
        
        bytes memory ticketData = _createTicketData(gasPriceBid_, swapData, false);
        uint amountToSend = address(this).balance;
        
        (bool success, ) = fxConfig.inbox.call{value: address(this).balance}(ticketData); 
        if (!success) {
            /// @dev If it fails the 1st bridge attempt, it decreases the L2 gas calculations
            ticketData = _createTicketData(gasPriceBid_, swapData, true);
            (success, ) = fxConfig.inbox.call{value: address(this).balance}(ticketData);

            if (!success) {
                _runEmergencyMode();
                isEmergency = true;
                emit EmergencyTriggered(accountDetails_.user, amountToSend);
            }
        }

        if (!isEmergency) {
            if (!storageBeacon.getEmitterStatus()) { 
                Emitter(fxConfig.emitter).forwardEvent(); 
            }
            storageBeacon.storeAccountPayment(address(this), amountToSend);
            emit FundsToArb(accountDetails_.user, amountToSend);
        }
    }

    /**
     * @dev Runs the L1 emergency swap in Uniswap. 
     *      If it fails, it doubles the slippage and tries again.
     *      If it fails again, it sends WETH back to the user.
     */
    function _runEmergencyMode() private nonReentrant { 
        address sBeacon = _getStorageBeacon(_beacon, 0);
        StorageBeacon.EmergencyMode memory eMode = StorageBeacon(sBeacon).getEmergencyMode();
        
        IWETH(eMode.tokenIn).deposit{value: address(this).balance}();
        uint balanceWETH = IWETH(eMode.tokenIn).balanceOf(address(this));

        IERC20(eMode.tokenIn).approve(address(eMode.swapRouter), balanceWETH);

        for (uint i=1; i <= 2;) {
            ISwapRouter.ExactInputSingleParams memory params =
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: eMode.tokenIn,
                    tokenOut: eMode.tokenOut, 
                    fee: eMode.poolFee,
                    recipient: accountDetails.user,
                    deadline: block.timestamp,
                    amountIn: balanceWETH,
                    amountOutMinimum: _calculateMinOut(eMode, i, balanceWETH), 
                    sqrtPriceLimitX96: 0
                });

            try eMode.swapRouter.exactInputSingle(params) { 
                break; 
            } catch {
                if (i == 1) {
                    unchecked { ++i; }
                    continue; 
                } else {
                    IERC20(eMode.tokenIn).transfer(accountDetails.user, balanceWETH);
                    break;
                }
            }
        } 
    }

    /*///////////////////////////////////////////////////////////////
                               Helpers
    //////////////////////////////////////////////////////////////*/

    /// @dev Transfers to Gelato its fee for calling the account
    function _transfer(uint256 amount_, address paymentToken_) private {
        if (paymentToken_ == fxConfig.ETH) {
            Address.functionCallWithValue(fxConfig.gelato, new bytes(0), amount_);
        } else {
            SafeTransferLib.safeTransfer(ERC20(paymentToken_), fxConfig.gelato, amount_); 
        }
    }

    /**
     * @dev Using the account slippage, calculates the minimum amount of tokens out.
     *      Uses the "i" variable from the parent loop to double the slippage, if necessary.
     */
    function _calculateMinOut(
        StorageBeacon.EmergencyMode memory eMode_, 
        uint i_,
        uint balanceWETH_
    ) private view returns(uint minOut) {
        (,int price,,,) = eMode_.priceFeed.latestRoundData();
        uint expectedOut = balanceWETH_.mulDivDown(uint(price) * 10 ** 10, 1 ether);
        uint minOutUnprocessed = 
            expectedOut - expectedOut.mulDivDown(accountDetails.userSlippage * i_ * 100, 1000000); 
        minOut = minOutUnprocessed.mulWadDown(10 ** 6);
    }

    /// @inheritdoc ozIPayMe
    function initialize(
        StorageBeacon.AccountConfig calldata accountDetails_, 
        address beacon_
    ) external initializer {
        accountDetails = accountDetails_;  
        fxConfig = StorageBeacon(_getStorageBeacon(beacon_, 0)).getFixedConfig();
        _beacon = beacon_;
    }

    /// @dev Gets a version of the Storage Beacon from a Beacon implementation
    function _getStorageBeacon(address beacon_, uint version_) private view returns(address) { 
        return ozUpgradeableBeacon(beacon_).storageBeacon(version_);
    }

    /*///////////////////////////////////////////////////////////////
                          Account methods
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ozIPayMe
    function changeAccountToken(
        address newToken_
    ) external onlyUser checkToken(newToken_) {
        accountDetails.userToken = newToken_;
        emit NewUserToken(msg.sender, newToken_);
    }

    /// @inheritdoc ozIPayMe
    function changeAccountSlippage(
        uint newSlippage_
    ) external onlyUser checkSlippage(newSlippage_) { 
        accountDetails.userSlippage = newSlippage_;
        emit NewUserSlippage(msg.sender, newSlippage_);
    }

    /// @inheritdoc ozIPayMe
    function changeAccountTokenNSlippage(
        address newToken_, 
        uint newSlippage_
    ) external onlyUser checkToken(newToken_) checkSlippage(newSlippage_) {
        accountDetails.userToken = newToken_;
        accountDetails.userSlippage = newSlippage_;
        emit NewUserToken(msg.sender, newToken_);
        emit NewUserSlippage(msg.sender, newSlippage_);
    } 

    /// @inheritdoc ozIPayMe
    function getUserDetails() external view returns(StorageBeacon.AccountConfig memory) {
        return accountDetails;
    }

    /// @inheritdoc ozIPayMe
    function withdrawETH_lastResort() external onlyUser {
        (bool success, ) = payable(accountDetails.user).call{value: address(this).balance}('');
        if (!success) revert CallFailed('ozPayMe: withdrawETH_lastResort failed');
    }

    /*///////////////////////////////////////////////////////////////
                        Retryable helper methods
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @dev Calculates the L1 gas values for the retryableticket's auto redeemption
     */
    function _calculateGasDetails(
        bytes memory swapData_, 
        uint gasPriceBid_, 
        bool decrease_
    ) private view returns(uint maxSubmissionCost, uint autoRedeem) {
        maxSubmissionCost = DelayedInbox(fxConfig.inbox).calculateRetryableSubmissionFee(
            swapData_.length,
            0
        );

        maxSubmissionCost = decrease_ ? maxSubmissionCost : maxSubmissionCost * 2;
        autoRedeem = maxSubmissionCost + (gasPriceBid_ * fxConfig.maxGas);
        if (autoRedeem > address(this).balance) autoRedeem = address(this).balance;
    }

    /**
     * @dev Creates the ticket's calldata based on L1 gas values
     */
    function _createTicketData( 
        uint gasPriceBid_, 
        bytes memory swapData_,
        bool decrease_
    ) private view returns(bytes memory) {
        (uint maxSubmissionCost, uint autoRedeem) = _calculateGasDetails(swapData_, gasPriceBid_, decrease_);

        return abi.encodeWithSelector(
            DelayedInbox(fxConfig.inbox).createRetryableTicket.selector, 
            fxConfig.OZL, 
            address(this).balance - autoRedeem,
            maxSubmissionCost, 
            fxConfig.OZL, 
            fxConfig.OZL, 
            fxConfig.maxGas,  
            gasPriceBid_, 
            swapData_
        );
    }
}
