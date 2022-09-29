const { ethers } = require('ethers');
const { parseEther, formatEther } = ethers.utils;
const { deployTestnet, simulateDeployment } = require('../../scripts/begin-testnet.js');
const { startListening } = require('./event-listener-for-test.js');

const { ops, l1SignerTestnet, usdtAddrArb, defaultSlippage, factoryABI } = require('../../scripts/state-vars.js');
const { assert } = require("console");



async function sendETHandAssert(newProxyAddr) {
    const value = 0.1;
    ops.to = newProxyAddr;
    ops.value = parseEther(value.toString());

    const tx = await l1SignerTestnet.sendTransaction(ops);
    await tx.wait();

    const balance = await hre.ethers.provider.getBalance(newProxyAddr);
    assert(formatEther(balance) == value);
    console.log('ETH successfully received in proxy (pre-bridge)');
}

function assertProof() {
    assert(1 > 2); 
    console.log('^^^ Only failed assertion to prove that it was configured properly');
    console.log('');
}

//-------

async function autoRedeem() {
    assertProof();

    const [
        storageBeacon,
        emitterAddr,
        newProxyAddr,
        redeemedHashes
    ] = await deployTestnet(true);

    // const [
    //     storageBeaconAddr,
    //     emitterAddr,
    //     redeemedHashesAddr
    // ] = await simulateDeployment();

    console.log('');
    await startListening(storageBeacon, emitterAddr, redeemedHashes);

    //Sends ETH to the proxy
    await sendETHandAssert(newProxyAddr);
}


async function manualRedeem() {
    assert(1 > 2); 
    console.log('^^^ Only failed assertion to prove it was configured properly');
    console.log('');

    console.log('--------------------- Contract addresses ---------------------');
    const [
        storageBeacon,
        emitterAddr,
        newProxyAddr,
        redeemedHashes
    ] = await deployTestnet(true, true);

    // const [
    //     storageBeaconAddr,
    //     newProxyAddr,
    //     redeemedHashesAddr
    // ] = await simulateDeployment();

    console.log('');
    await startListening(storageBeacon, emitterAddr, redeemedHashes, true);

    //Sends ETH to the proxy
    await sendETHandAssert(newProxyAddr);
}


(async () => await autoRedeem())();
(async () => await manualRedeem())();





