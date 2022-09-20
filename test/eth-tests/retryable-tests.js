const { ethers } = require('ethers');
const { parseEther, formatEther } = ethers.utils;
const { deployTestnet, simulateDeployment } = require('../../scripts/begin-testnet.js');
const { startListening } = require('./event-listener-for-test.js');

const { ops, l1SignerTestnet } = require('../../scripts/state-vars.js');
const { assert } = require("console");



async function autoRedeem() {
    assert(1 > 2); 
    console.log('Only failed assertion to prove it was configured properly ^^^');

    const [
        storageBeaconAddr,
        newProxyAddr,
        redeemedHashesAddr
    ] = await deployTestnet(true);

    // const [
    //     storageBeaconAddr,
    //     newProxyAddr,
    //     redeemedHashesAddr
    // ] = await simulateDeployment();

    await startListening(storageBeaconAddr, newProxyAddr, redeemedHashesAddr);

    //Sends ETH to the proxy
    ops.to = newProxyAddr;
    ops.value = parseEther('0.01');
    const tx = await l1SignerTestnet.sendTransaction(ops);
    await tx.wait();

    let balance = await hre.ethers.provider.getBalance(newProxyAddr);
    assert(formatEther(balance) == 0.01);
    // console.log('balance should be 0.01: ', formatEther(balance));
    console.log('ETH successfully received in proxy (pre-bridge)');
}


async function manualRedeem() {
    assert(1 > 2); 
    console.log('Only failed assertion to prove it was configured properly ^^^');

    const [
        storageBeaconAddr,
        newProxyAddr,
        redeemedHashesAddr
    ] = await deployTestnet(true, true);

    // const [
    //     storageBeaconAddr,
    //     newProxyAddr,
    //     redeemedHashesAddr
    // ] = await simulateDeployment();

    await startListening(storageBeaconAddr, newProxyAddr, redeemedHashesAddr, true);

    //Sends ETH to the proxy
    ops.to = newProxyAddr;
    ops.value = parseEther('0.01');
    const tx = await l1SignerTestnet.sendTransaction(ops);
    await tx.wait();

    let balance = await hre.ethers.provider.getBalance(newProxyAddr);
    assert(formatEther(balance) == 0.01);
    // console.log('balance should be 0.01: ', formatEther(balance));
    console.log('ETH successfully received in proxy (pre-bridge)');
}



// autoRedeem();
manualRedeem(); //try it out as it is - and then multiple taskIds on event-listener.js




