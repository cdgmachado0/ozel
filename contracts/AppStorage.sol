// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import './interfaces/IGatewayRegistry.sol';
import './interfaces/IGateway.sol';
import './facets/ManagerFacet.sol';
// import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import './facets/ERC20Facet/IERC20Facet.sol';
import {IRenPool, ITricrypto} from './interfaces/ICurve.sol';
import './facets/VaultFacet.sol';


struct AppStorage {
    uint num;

    IGatewayRegistry registry;
    ManagerFacet manager; 
    ITricrypto tricrypto;
    VaultFacet vault;
    IRenPool renPool; 
    ICrvLpToken crvTricrypto;

    IERC20Facet renBTC;
    IERC20Facet USDT;
    IERC20Facet WETH;
    IERC20Facet WBTC;
    IERC20Facet PYY;

    uint dappFee;
    uint slippageOnCurve;
    uint totalVolume;
    uint distributionIndex;

    mapping(address => uint) pendingWithdrawal;
    mapping(address => uint) usersPayments;
    mapping(bool => PYYERC20) py; 

    address ETH;



}

struct PYYERC20 {
    mapping(address => uint256) _balances;
    mapping(address => mapping(address => uint256)) _allowances;
    uint  _totalSupply;
    string  _name;
    string  _symbol;
}