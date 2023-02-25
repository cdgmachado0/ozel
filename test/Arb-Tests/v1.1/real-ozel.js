const { ethers } = require("ethers");
const assert = require('assert');
const {
    parseEther, 
    formatEther, 
    hexStripZeros 
} = ethers.utils;

const { err } = require('../../errors'); 

const { 
    balanceOfOZL, 
    transferOZL, 
    withdrawShareOZL, 
    getVarsForHelpers,
    enableWithdrawals,
    deploy,
    getOzelIndex,
    addTokenToDatabase,
    getRegulatorCounter,
    getTestingNumber,
    replaceForModVersion,
    queryTokenDatabase,
    removeTokenFromDatabase,
    getAccData,
    sendETHWithAlias,
    deployFacet,
    activateProxyLikeOpsL2,
    getInitSelectors,
    deployV1_1,
    sendETHOps
} = require('../../../scripts/helpers-arb');

const { getSelectors } = require('../../../scripts/myDiamondUtil');

const { 
    createProxy, 
    sendETH,
    activateOzBeaconProxy,
    deployContract
} = require('../../../scripts/helpers-eth');

const { 
    usdtAddrArb,
    defaultSlippage,
    nullAddr,
    deadAddr,
    crvTricrypto,
    diamondABI,
    usxAddr,
    dForcePoolAddr,
    ops,
    protocolFee,
    tokensDatabaseL1,
    usdcAddr,
    crv2PoolAddr,
    pokeMeOpsAddr,
    accountL2ABI,
    fraxAddr,
    wbtcAddr
} = require('../../../scripts/state-vars');;

const { MaxUint256 } = ethers.constants;


let ozlDiamondAddr, ozlDiamond, newProxyAddr, ozMiddle;
let ownerAddr, signer, signerAddr;
let tx, receipt, balance, accData;
let usersProxies = [];
let signers, signerAddr2, beacon, ozMiddleware;
let facetCut, accounts, names, accountDetails;
let factory, factoryAddr, constrArgs, beaconAddr;


describe('With deployed OZL', async () => {

    before(async () => {
        ozlDiamondAddr = '0x7D1f13Dd05E6b0673DC3D0BFa14d40A74Cfa3EF2';
        deployer2 = '0xe738696676571D9b74C81716E4aE797c2440d306';
        account = '0xb922E7FD3b4b7829D096508B6e492FA99cc8cCF0';
        testAcc2 = '0x9c1241606DafbAeE46dFAdF3B0deCd0B653f342e';
        testAcc = '0xc4D53D620d2ce9f0DE3eC241d4B74DD36A2989a1';
        ozlDiamond = await hre.ethers.getContractAt(diamondABI, ozlDiamondAddr);
        signerAddr = testAcc;
        ([ signer ] = await hre.ethers.getSigners());

        ([ ozMiddleware, beacon ] = await deployV1_1(ozlDiamond, deployer2));

        accountDetails = [
            signerAddr,
            usdtAddrArb,
            defaultSlippage,
            'test'
        ];

        accData = getAccData(testAcc, usdtAddrArb, defaultSlippage);
        getVarsForHelpers(ozlDiamond, '');

        //-------
        await sendETHOps('11', deployer2);

        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [deployer2],
        });

        const depSigner = await hre.ethers.provider.getSigner(deployer2);
        const signerAddrUndoAlias = '0xe28ed6e51aad88f6f4ce6ab8827279cfffb91155';
        await ozlDiamond.connect(depSigner).setAuthorizedCaller(signerAddrUndoAlias, true, ops);

        await hre.network.provider.request({
            method: "hardhat_stopImpersonatingAccount",
            params: [deployer2],
        });
    });

    it('should properly calculate new Ozel balances in an L1 user after having used an L2 Account', async () => {
        console.log('');
        const ozlBalanceTestAcc2Pre = await balanceOfOZL(testAcc2);
        console.log('OZL balance account1 pre-tx: ', ozlBalanceTestAcc2Pre);

        const ozlBalanceTestAccPre = await balanceOfOZL(testAcc);
        console.log('OZL balance account2 pre-tx: ', ozlBalanceTestAccPre);

        let totalOZL = ozlBalanceTestAcc2Pre + ozlBalanceTestAccPre;
        console.log('total OZL balance: ', totalOZL);
        assert(totalOZL > 99.99 && totalOZL < 100);

        const USDT = await hre.ethers.getContractAt('IERC20', usdtAddrArb);
        const balanceUSDTpre = await USDT.balanceOf(testAcc);
        console.log('USDT balance account2 pre-tx: ', balanceUSDTpre / 10 ** 6);
        assert.equal(Number(balanceUSDTpre), 0);

        console.log('');
        console.log('***** Tx sent from account2 *****');
        console.log('');

        //-------------
        const value = parseEther('1');
        const iface = new ethers.utils.Interface(diamondABI);
        const encodedData = iface.encodeFunctionData('exchangeToAccountToken', [
            accData,
            value,
            account
        ]);

        ops.value = value;
        ops.to = ozlDiamond.address;
        ops.data = encodedData;
        tx = await signer.sendTransaction(ops);
        await tx.wait();

        //--------------
        const ozlBalanceTestAcc2Post = await balanceOfOZL(testAcc2);
        console.log('OZL balance account1 post-tx: ', ozlBalanceTestAcc2Post);

        const ozlBalanceTestAccPost = await balanceOfOZL(testAcc);
        console.log('OZL balance account2 post-tx: ', ozlBalanceTestAccPost);

        totalOZL = ozlBalanceTestAcc2Post + ozlBalanceTestAccPost;
        console.log('total OZL balance: ', totalOZL);
        assert(totalOZL > 99.99 && totalOZL < 100);

        const balanceUSDTpost = await USDT.balanceOf(testAcc);
        console.log('USDT balance account2 post-tx: ', balanceUSDTpost / 10 ** 6);
        assert(Number(balanceUSDTpost) > 1600);
    });


});