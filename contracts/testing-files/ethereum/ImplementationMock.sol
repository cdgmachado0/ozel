// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.14; 


import '@rari-capital/solmate/src/utils/ReentrancyGuard.sol';
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import '../../interfaces/ethereum/IOps.sol';
import '../../interfaces/common/IWETH.sol';
import '../../ethereum/Emitter.sol';
import '../../ethereum/StorageBeacon.sol';
import '../../ethereum/ozUpgradeableBeacon.sol';
import '../../ethereum/ozMiddleware.sol';
import './StorageBeaconMock.sol';
import '../../Errors.sol';



contract ImplementationMock is ReentrancyGuard, Initializable { 

    using LibCommon for bytes; 

    bytes dataForL2;

    address private beacon;
    
    address private constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address payable private immutable gelato;
    address private immutable ops;
    address private immutable emitter;
    address payable private immutable middleware;

    event FundsToArb(address indexed sender, uint amount);
    event EmergencyTriggered(address indexed sender, uint amount); 
    event MockCalled(uint num);

    constructor(
        address ops_, 
        address payable gelato_, 
        address emitter_,
        address payable middleware_
    ) {
        ops = ops_;
        gelato = gelato_;
        emitter = emitter_;
        middleware = middleware_;
    }

    /*///////////////////////////////////////////////////////////////
                              Modifiers
    //////////////////////////////////////////////////////////////*/

    /// @dev Checks that only Gelato's PokeMe can make the call
    modifier onlyOps() { 
        if (msg.sender != ops) revert NotAuthorized(msg.sender); 
        _;
    }

    modifier onlyUser() {
        (address user,,) = dataForL2.extract();
        if (msg.sender != user) revert NotAuthorized(msg.sender);
        _;
    }

    /// @dev Checks that the token exists and that's not address(0)
    modifier checkToken(address newToken_) {
        StorageBeacon storageBeacon = StorageBeacon(_getStorageBeacon(beacon, 0)); 
        if (newToken_ == address(0)) revert CantBeZero('address');
        if (!storageBeacon.queryTokenDatabase(newToken_)) revert TokenNotInDatabase(newToken_);
        _;
    }

    /// @dev Checks that the new slippage is more than 1 basis point
    modifier checkSlippage(uint newSlippage_) {
        if (newSlippage_ < 1) revert CantBeZero('slippage');
        _;
    }


    /*///////////////////////////////////////////////////////////////
                            Main functions
    //////////////////////////////////////////////////////////////*/

    function sendToArb( 
        uint gasPriceBid_,
        uint amountToSend_,
        address account_
    ) external payable onlyOps {   
        (uint fee, ) = IOps(ops).getFeeDetails();
        Address.functionCallWithValue(gelato, new bytes(0), fee);

        (bool isEmergency, bool emitterStatus, address user) = 
            ozMiddleware(middleware).forwardCall{value: address(this).balance}(
                gasPriceBid_, 
                dataForL2,
                amountToSend_,
                account_
            );

        if (!isEmergency) {
            if (!emitterStatus) { 
                Emitter(emitter).forwardEvent(user); 
            }
            emit FundsToArb(user, amountToSend_);
        } else {
            emit EmergencyTriggered(user, amountToSend_);
        }
        _callStorageBeaconMock();
    }

    //Extra function for StorageBeaconMock
    function _callStorageBeaconMock() private {
        uint num = StorageBeaconMock(_getStorageBeacon(beacon, 1)).getExtraVar();
        emit MockCalled(num);
    }

    /*///////////////////////////////////////////////////////////////
                               Helpers
    //////////////////////////////////////////////////////////////*/
    
    function initialize(
        address beacon_,
        bytes memory dataForL2_
    ) external initializer {
        beacon = beacon_;
        dataForL2 = dataForL2_;
    }

    /// @dev Gets a version of the Storage Beacon from a Beacon implementation
    function _getStorageBeacon(address beacon_, uint version_) private view returns(address) { 
        return ozUpgradeableBeacon(beacon_).storageBeacon(version_);
    }

    /*///////////////////////////////////////////////////////////////
                          Account methods
    //////////////////////////////////////////////////////////////*/
    
    function changeAccountToken(
        address newToken_
    ) external checkToken(newToken_) onlyUser { 
        (address user,,uint16 slippage) = dataForL2.extract();
        dataForL2 = bytes.concat(bytes20(user), bytes20(newToken_), bytes2(slippage));
    }

    
    function changeAccountSlippage(
        uint16 newSlippage_
    ) external checkSlippage(newSlippage_) onlyUser { 
        (address user, address token,) = dataForL2.extract();
        dataForL2 = bytes.concat(bytes20(user), bytes20(token), bytes2(newSlippage_));
    }

    
    function changeAccountTokenNSlippage( 
        address newToken_, 
        uint16 newSlippage_
    ) external checkToken(newToken_) checkSlippage(newSlippage_) onlyUser {
        (address user,,) = dataForL2.extract();
        dataForL2 = bytes.concat(bytes20(user), bytes20(newToken_), bytes2(newSlippage_));
    } 


    function getAccountDetails() external view returns(
        address user, 
        address token, 
        uint16 slippage
    ) {
        (user, token, slippage) = dataForL2.extract();
    }


    function withdrawETH_lastResort() external onlyUser { 
        (bool success, ) = payable(msg.sender).call{value: address(this).balance}('');
        if (!success) revert CallFailed('ozPayMe: withdrawETH_lastResort failed');
    }
}
