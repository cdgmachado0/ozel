// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.14; 


import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import '@rari-capital/solmate/src/utils/ReentrancyGuard.sol';
import './ozUpgradeableBeacon.sol';
import '../interfaces/IOps.sol';
import './ozBeaconProxy.sol';
import './StorageBeacon.sol';
import '../Errors.sol';

import 'hardhat/console.sol';



contract ProxyFactory is ReentrancyGuard, Initializable { 
    address private beacon;


    function initialize(address beacon_) external initializer {
        beacon = beacon_;
    }


    function createNewProxy(
        StorageBeacon.UserConfig calldata userDetails_
    ) external nonReentrant returns(address) {
        if(bytes(userDetails_.accountName).length == 0) revert CantBeZero('accountName'); //<--- new
        if (bytes(userDetails_.accountName).length > 18) revert NameTooLong();

        if (userDetails_.user == address(0) || userDetails_.userToken == address(0)) revert CantBeZero('address');
        if (userDetails_.userSlippage <= 0) revert CantBeZero('slippage');
        if (!StorageBeacon(_getStorageBeacon(0)).queryTokenDatabase(userDetails_.userToken)) revert TokenNotInDatabase(userDetails_.userToken);

        bytes memory idData = abi.encodeWithSignature( 
            'issueUserID((address,address,uint256,string))', 
            userDetails_
        ); 

        (bool success, bytes memory returnData) = _getStorageBeacon(0).call(idData);
        if (!success) revert CallFailed('ProxyFactory: createNewProxy failed');
        uint userId = abi.decode(returnData, (uint));

        ozBeaconProxy newProxy = new ozBeaconProxy(
            beacon,
            new bytes(0)
        );

        bytes memory createData = abi.encodeWithSignature(
            'initialize(uint256,address)',
            userId, beacon
        );
        (success, ) = address(newProxy).call(createData);
        if (!success) revert CallFailed('ProxyFactory: init failed');

        _startTask(address(newProxy));
        StorageBeacon(_getStorageBeacon(0)).saveUserToDetails(address(newProxy), userDetails_); //change userDetails struct to accountDetails

        return address(newProxy);
    }


    function _getStorageBeacon(uint version_) private view returns(address) {
        return ozUpgradeableBeacon(beacon).storageBeacon(version_);
    }


    // *** GELATO TASK ******

    function _startTask(address beaconProxy_) private { 
        StorageBeacon.FixedConfig memory fxConfig = StorageBeacon(_getStorageBeacon(0)).getFixedConfig(); 

        (bytes32 id) = IOps(fxConfig.ops).createTaskNoPrepayment( 
            beaconProxy_,
            bytes4(abi.encodeWithSignature('sendToArb()')),
            beaconProxy_,
            abi.encodeWithSignature('checker()'),
            fxConfig.ETH
        );

        StorageBeacon(_getStorageBeacon(0)).saveTaskId(beaconProxy_, id);
    }
}