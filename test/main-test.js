const { ethers } = require("ethers");
const assert = require('assert');
// const expect = require('chai').expect;
// const expect = require('expect');
const truffleAssert = require('truffle-assertions');

const { 
    parseEther, 
    formatEther, 
    defaultAbiCoder: abiCoder, 
    keccak256,
    id,
    hexZeroPad,
    hexStripZeros,
    arrayify
} = ethers.utils;
const { deploy } = require('../scripts/deploy.js');
const { Bridge } = require('arb-ts');
const { hexDataLength } = require('@ethersproject/bytes');
require('dotenv').config();



const {
    balanceOfPYY, 
    transferPYY, 
    withdrawSharePYY, 
    getVarsForHelpers,
    sendETH,
    getCalldata,
    getCalldata2
} = require('../scripts/helpers-arb.js');

const { 
    chainId,
    pokeMeOpsAddr,
    hopBridge,
    usdtAddrArb,
    wbtcAddr,
    renBtcAddr,
    usdcAddr,
    mimAddr,
    fraxAddr,
    inbox,
    signerX,
    l2Provider,
    l2Signer,
    l1Signer,
    wethAddr,
    defaultSlippage,
    gelatoAddr,
    ETH,
    swapRouterUniAddr,
    poolFeeUni,
    nullAddr,
    chainlinkAggregatorAddr,
    deadAddr
 } = require('../scripts/state-vars.js');

 const {
    deployContract,
    sendTx,
    getArbitrumParams,
    activateOzBeaconProxy,
    deploySystemOptimistically,
    errors,
    getEventParam,
    sendETHv2,
    activateProxyLikeOps,
    compareTopicWith
 } = require('../scripts/helpers-eth');

 const { err } = require('./errors.js');



let signerAddr, signerAddr2;
let ozERC1967proxyAddr, storageBeacon, emitter;
let userDetails;
let newProxyAddr, newProxy;
let balance;
let newUserToken, newUserSlippage;
let user;
let ops;
let signer2;



 describe('Ethereum-side', async () => {
    console.log('.');
    before( async () => {
        const bridge = await Bridge.init(l1Signer, l2Signer);
        ([signerAddr, signerAddr2] = await hre.ethers.provider.listAccounts()); 
        console.log('signer address: ', signerAddr);

        userDetails = [
            signerAddr,
            usdtAddrArb,
            defaultSlippage
        ];
        ([ozERC1967proxyAddr, storageBeacon, emitter] = await deploySystemOptimistically(userDetails, signerAddr));
    });

    describe('ozBeaconProxy', async () => {

        describe('Optimistic deployment', async () => {
            it('should create a proxy successfully', async () => {
                await sendTx({
                    receiver: ozERC1967proxyAddr,
                    method: 'createNewProxy',
                    args: [userDetails]
                });
                newProxyAddr = (await storageBeacon.getProxyByUser(signerAddr)).toString(); 
                console.log('Proxy #1: ', newProxyAddr);
                assert.equal(newProxyAddr.length, 42);
            });

            it('should have an initial balance of 0.01 ETH', async () => {
                await sendETHv2(newProxyAddr);
                balance = await hre.ethers.provider.getBalance(newProxyAddr);
                assert.equal(formatEther(balance), '0.01');
            });

            it('should have a final balance of 0 ETH', async () => {
                await activateProxyLikeOps(newProxyAddr, ozERC1967proxyAddr);
                balance = await hre.ethers.provider.getBalance(newProxyAddr);
                assert.equal(formatEther(balance), 0);
            });

            describe('fallback() / ozPayMe', async () => {
                it('should not allow re-calling / initialize()', async () => {
                    await assert.rejects(async () => {
                        await sendTx({
                            receiver: newProxyAddr,
                            method: 'initialize',
                            args: [0, nullAddr]
                        });
                    }, {
                        name: 'Error',
                        message: err().alreadyInitialized 
                    });
                });

                it('should not allow when not Ops calls / sendToArb()', async () => {
                    await assert.rejects(async () => {
                        await activateOzBeaconProxy(newProxyAddr);
                    }, {
                        name: 'Error',
                        message: err().onlyOps 
                    });
                });

                it('should allow the user to change userToken / changeUserToken()', async () => {
                    receipt = await sendTx({
                        receiver: newProxyAddr,
                        method: 'changeUserToken',
                        args: [usdcAddr]
                    });
                    newUserToken = getEventParam(receipt);
                    assert.equal(newUserToken, usdcAddr.toLowerCase());
                });

                it('should not allow an external user to change userToken / changeUserToken()', async () => {
                    await assert.rejects(async () => {
                        await sendTx({
                            receiver: newProxyAddr,
                            method: 'changeUserToken',
                            args: [usdcAddr],
                            isSigner2: true
                        });
                    }, {
                        name: 'Error',
                        message: err().notAuthorized
                    });
                });

                it('should allow the user to change userSlippage / changeUserSlippage()', async () => {
                    receipt = await sendTx({
                        receiver: newProxyAddr,
                        method: 'changeUserSlippage',
                        args: ['200']
                    });
                    newUserSlippage = getEventParam(receipt);
                    assert.equal(arrayify(newUserSlippage), '200');
                });

                it('should not allow an external user to change userSlippage / changeUserSlippage()', async () => {
                    await assert.rejects(async () => {
                        await sendTx({
                            receiver: newProxyAddr,
                            method: 'changeUserSlippage',
                            args: ['200'],
                            isSigner2: true
                        });
                    }, {
                        name: 'Error',
                        message: err().notAuthorized
                    });
                });

                it('should should allow funds to be sent with correct userDetails even if malicious data was passed / sendToArb() - delegate()', async () => {
                    newProxy = await hre.ethers.getContractAt('ozBeaconProxy', newProxyAddr);
                    ops = await hre.ethers.getContractAt('IOps', pokeMeOpsAddr);
                    signer2 = await hre.ethers.provider.getSigner(signerAddr2);
                    evilVarConfig = [0, 0, 0];
                    evilUserDetails = [deadAddr, deadAddr, 0];

                    await ops.connect(signer2).createTaskNoPrepayment(
                        newProxyAddr,
                        0xaa309254, //first 4 bytes of sendToArb(tuplex2)
                        newProxyAddr,
                        0xcf5303cf, //first 4 bytes of checker()
                        ETH
                    );

                    await sendETHv2(newProxyAddr);
                    const receipt = await activateProxyLikeOps(newProxyAddr, signerAddr2, true, [evilVarConfig, evilUserDetails]);

                    balance = await hre.ethers.provider.getBalance(newProxyAddr);
                    assert.equal(balance.toString(), 0);

                    const areEqual = compareTopicWith('Signer', signerAddr, receipt);
                    assert.equal(areEqual, true);

               

                    // for (let i=0; i < receipt.events.length; i++) {
                    //     for (let j=0; j < receipt.events[i].topics.length; j++) {
                    //         let topic = hexStripZeros(receipt.events[i].topics[j]);
                    //         if (topic === signerAddr) {
                    //             assert.equal(topic, signerAddr);
                    //             return;
                    //         }
                    //     }
                    // }
                });

                xit('should emit the ticket ID  / changeUserSlippage()', async () => {
                    
                });


            });

        });

    });

    describe('Emitter', async () => {

        it('should emit ticket ID / forwardEvent()', async () => {
            await sendETHv2(newProxyAddr);
            const receipt = await activateProxyLikeOps(newProxyAddr, ozERC1967proxyAddr);
            const showTicketSignature = '0xbca70dc8f665e75505547ec15f8c9d9372ac2b33c1746a7e01b805dae21f6696';

            for (let i=0; i < receipt.events.length; i++) {
                for (let j=0; j < receipt.events[i].topics.length; j++) {
                    let topic = hexStripZeros(receipt.events[i].topics[j]);
                    if (topic === showTicketSignature) {
                        const ticketID = receipt.events[i].topics[1];
                        assert(typeof parseInt(ticketID) === 'number');
                        return;
                    }
                }
            }
        });

        it('should not allow an unauhtorized user to emit / forwardEvent()', async () => {
            await assert.rejects(async () => {
                await emitter.forwardEvent(000000);
            }, {
                name: 'Error',
                message: err().notProxy 
            });
        });

        xit('should allow the owner to disable the Emitter', async () => {

            //Set signerAddr to role 0 for calling disableEmitter() on ozPayMe
            await rolesAuthority.setUserRole(signerAddr, 0, true);
            await rolesAuthority.setRoleCapability(0, newProxyAddr, '0xa2d4d48b', true); //disableEmitter()


        });


    })

    


    


  

    


  });