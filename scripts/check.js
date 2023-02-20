const { 
    pokeMeOpsAddr,
    usdtAddrArb,
    usdcAddr,
    inbox,
    wethAddr,
    gelatoAddr,
    ETH,
    swapRouterUniAddr,
    poolFeeUni,
    chainlinkAggregatorAddr,
    factoryABI,
    myReceiver,
    ops,
    fraxAddr,
    proxyABIeth,
    opsL2,
    mimAddr,
    wbtcAddr,
    defaultSlippage
} = require('./state-vars.js');

const { 
    getArbitrumParams,
    getFakeOZLVars,
    deployContract,
    getInitSelectors,
    sendETH,
    activateProxyLikeOps
 } = require('./helpers-eth.js');

const { parseEther, formatEther } = require('ethers/lib/utils');



async function main() {
    const redeemedHashesAddr = '0xD617AfE3D42Ca8e5a1514A90Ec14020E85993079';
    const redeemedHashes = await hre.ethers.getContractAt('RedeemedHashes', redeemedHashesAddr);
    const newOwner = '0x366D9C2cf28A2A5A4d80879964AF1EBb7D7dB086';

    let owner = await redeemedHashes.owner();
    console.log('owner old: ', owner);

    const tx = await redeemedHashes.transferOwnership(newOwner);
    const receipt = await tx.wait();
    console.log('done: ', receipt.transactionHash);

    owner = await redeemedHashes.owner();
    console.log('owner new: ', owner);

}

// main();


async function fixSlippage() {
    const deployer2 = '0xe738696676571D9b74C81716E4aE797c2440d306';
    const beaconAddr = '0xB318dE9d697933bF9BF32861916A338B3e7AbD5a';
    const emitterAddr = '0xd986Ac35f3aD549794DBc70F33084F746b58b534';
    const ozMiddlewareAddr = '0x3164a03cDbbf607Db19a366416113f7f74341B56';
    const beacon = await hre.ethers.getContractAt('ozUpgradeableBeacon', beaconAddr);
    const [ signer ] = await hre.ethers.getSigners();

    ops.value = parseEther('3');
    ops.to = deployer2;
    await signer.sendTransaction(ops);
    delete ops.value;
    delete ops.to;

    let impl = await beacon.implementation();
    console.log('impl pre: ', impl);
    //--------

    constrArgs = [
        pokeMeOpsAddr,
        gelatoAddr,
        emitterAddr,
        ozMiddlewareAddr
    ];

    const [ newPaymeAddr ] = await deployContract('ozPayMe', constrArgs); //remember to get rid of ops
    //------

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [deployer2],
    });

    const deployerSigner = await hre.ethers.provider.getSigner(deployer2);
    let tx = await beacon.connect(deployerSigner).upgradeTo(newPaymeAddr);
    await tx.wait();

    await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [pokeMeOpsAddr],
    });

    impl = await beacon.implementation();
    console.log('impl post: ', impl);
    console.log('UPGRADE DONE *****');

    //----- UPGRADE DONE --------
}


// fixSlippage();


async function testUpgrade() {
    await fixSlippage();

    const ozERC1967proxyAddr = '0x44e2e47039616b8E69dC153add52C415f22Fab2b';
    const factory = await hre.ethers.getContractAt('ProxyFactory', ozERC1967proxyAddr);
    const [ signer ] = await hre.ethers.getSigners();
    const signerAddr = await signer.getAddress();
    const storageBeaconAddr = '0x53A64483Ad7Ca5169F26A8f796B710aCAdEb8f0C';
    const storageBeacon = await hre.ethers.getContractAt('StorageBeacon', storageBeaconAddr);

    accountDetails = [
        signerAddr,
        usdtAddrArb,
        defaultSlippage,
        'test'
    ];

    let tx = await factory.createNewProxy(accountDetails, ops);
    let receipt = await tx.wait();
    console.log('Account created in: ', receipt.transactionHash);

    const [ proxies ] = await storageBeacon.getAccountsByUser(signerAddr);
    const account = proxies[0].toString(); 
    await sendETH(account, 0.1);

    let balance = await hre.ethers.provider.getBalance(account);
    console.log('bal pre: ', formatEther(balance));
    await activateProxyLikeOps(account, ozERC1967proxyAddr); 
    balance = await hre.ethers.provider.getBalance(account);
    console.log('bal post: ', formatEther(balance));

}

testUpgrade();