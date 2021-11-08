// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/******************************************************************************\
* Author: Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
* EIP-2535 Diamonds: https://eips.ethereum.org/EIPS/eip-2535
*
* Implementation of a diamond.
/******************************************************************************/

import {LibDiamond} from "../libraries/LibDiamond.sol";
import { IDiamondLoupe } from "../interfaces/IDiamondLoupe.sol";
import { IDiamondCut } from "../interfaces/IDiamondCut.sol";
import { IERC173 } from "../interfaces/IERC173.sol";
import { IERC165 } from "../interfaces/IERC165.sol";

import 'hardhat/console.sol';


import {AppStorage, PYYERC20} from '../AppStorage.sol'; 

import '../interfaces/IGatewayRegistry.sol';
import '../interfaces/IGateway.sol';
import '../facets/ManagerFacet.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {IRenPool, ITricrypto} from '../interfaces/ICurve.sol';
import '../facets/VaultFacet.sol';
import '../facets/ERC20Facet/IERC20Facet.sol';
import '../interfaces/ICrvLpToken.sol';


// It is exapected that this contract is customized if you want to deploy your diamond
// with data from a deployment script. Use the init function to initialize state variables
// of your diamond. Add parameters to the init funciton if you need to.

contract DiamondInit {    //moving variables - need to be passed to init and put on LibDiamond

    AppStorage internal s;
    PYYERC20 internal p;
    // You can add parameters to this function in order to pass in 
    // data to set your own state variables
    function init(
        LibDiamond.Facets memory _facets,
        LibDiamond.VarsAndAddresses memory _vars
    ) external {
        console.log('yatzi');
        // adding ERC165 data
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        ds.supportedInterfaces[type(IERC165).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondCut).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondLoupe).interfaceId] = true;
        ds.supportedInterfaces[type(IERC173).interfaceId] = true;

        //Ads selectors to Facets mapping
        for (uint i; i < _facets.selectors.length; i++) {
            bytes4[] memory selectors = _facets.selectors[i];
            for (uint j; j < selectors.length; j++) {
                ds.facets[selectors[j]] = _facets.addresses[i];
            }
        }
        
        //Sets name and symbol on PayToken
        p._name = 'PayToken';
        p._symbol = 'PYY';

        //Sets addresses on contracts
        s.registry = IGatewayRegistry(_vars.contracts[0]);
        s.manager = ManagerFacet(_vars.contracts[1]);
        s.tricrypto = ITricrypto(_vars.contracts[2]);
        s.vault = VaultFacet(_vars.contracts[3]);
        s. renPool = IRenPool(_vars.contracts[4]);
        s.crvTricrypto = ICrvLpToken(_vars.contracts[5]);

        //Sets ERC20 instances
        console.log('renBTC: ', _vars.erc20s[0]);
        // s.renBTC = IERC20Facet(_vars.erc20s[0]);
        // s.USDT = IERC20Facet(_vars.erc20s[]);
        // s.WETH = IERC20Facet(_vars.erc20s[]);
        // s.WBTC = IERC20Facet(_vars.erc20s[]);
        // s.PYY = IERC20Facet(_vars.erc20s[]);

        //Sets app's general variables
        // s.ETH = 
        // s.dappFee = 
        // s.slippageOnCurve =

        console.log('selector: ');
        revert('hereee');




        // for (uint i; i < _selectors.length; i++) {
        //     bytes4[] memory selectors = _selectors[i];
        //     for (uint j; j < selectors.length; j++) {
        //         ds.facets[selectors[j]] = _facetAddresses[i];
        //     }
        // }
        // console.log('facet: ', ds.facets[0x893d20e8]);
        // ds.facets[_selectors[0][0]] = _facetAddresses[0];
        // console.log('y: ', ds.facets[_selectors[0][0]]);
        // revert();

        // ds.facetAddresses = _facetAddresses;
        // ds.facetFunctionSelectors[_facetAddresses[0]] = 
        // ds.selectorToFacetAndPosition[_selectLoup]

        // for (uint z = 0; z < _selectors.length; z++) {
        //     console.logBytes4( _selectors[z]);
        // }

        // revert('reverted hereee');

        // for (uint i = 0; i < _selectors.length; i++) {
        //     for (uint y = 0; y < _selectors[i].length; y++) {
        //         bytes4 selector = _selectors[i][y];
        //         ds.facets[selector] = _facetAddresses[i];
        //     }
        // } // -----> assign each selector to address on ds, and check on msg.sig if it's right now 
        

        console.log('ttttttt');
        // ds.ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
        s.num = 23;

        // IGatewayRegistry registry;
        // Manager manager; 
        // IERC20 renBTC;

        // Vault vault;
        // IRenPool renPool; 
        // ITricrypto tricrypto2;

        // IERC20 USDT;
        // IERC20 WETH;
        // IERC20 WBTC;
        // address ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
        // IERC20 PYY;
        // ICrvLpToken crvTricrypto = ICrvLpToken(0xc4AD29ba4B3c580e6D59105FFf484999997675Ff);

        // uint dappFee = 10; //prev: 10 -> 0.1% / 100-1 / 1000-10 / 10000 - 100%
        // uint totalVolume;
        // uint distributionIndex;

        console.log('zzzzzzz');

        // add your own state variables 
        // EIP-2535 specifies that the `diamondCut` function takes two optional 
        // arguments: address _init and bytes calldata _calldata
        // These arguments are used to execute an arbitrary function using delegatecall
        // in order to set state variables in the diamond during deployment or an upgrade
        // More info here: https://eips.ethereum.org/EIPS/eip-2535#diamond-interface 
    }


}