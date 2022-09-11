const { ethers } = require("ethers");
const assert = require('assert');
require('dotenv').config();

const { 
    formatEther, 
    arrayify,
    formatBytes32String,
    keccak256,
    toUtf8Bytes,
    parseEther
} = ethers.utils;


const { 
    wethAddr,
    pokeMeOpsAddr,
    usdtAddrArb,
    usdcAddr,
    fraxAddr,
    l1Signer,
    defaultSlippage,
    ETH,
    nullAddr,
    deadAddr,
    proxyABIeth,
    factoryABI
 } = require('../../scripts/state-vars.js');

 const {
    deployContract,
    activateOzBeaconProxy,
    deploySystem,
    getEventParam,
    activateProxyLikeOps,
    compareTopicWith,
    storeVarsInHelpers,
    compareEventWithVar
 } = require('../../scripts/helpers-eth');

 const { err } = require('../errors.js');



let signerAddr, signerAddr2;
let ozERC1967proxyAddr, storageBeacon, fakeOZLaddr;
let userDetails;
let newProxyAddr, newProxy;
let balance;
let newUserToken, newUserSlippage;
let ops;
let signer, signer2, signers;
let showTicketSignature;
let ticketIDtype;
let pulledUserDetails;
let taskID;
let storageBeaconMockAddr; 
let USDC, WETH;
let usersProxies = [];
let evilVarConfig = [0, 0, 0];
let evilUserDetails = [deadAddr, deadAddr, 0];
let preBalance, postBalance;
let isExist, proxyFactory;
let tx, receipt;



 describe('Ethereum-side', async function () {
    this.timeout(1000000);

    before( async () => {
        ([signerAddr, signerAddr2] = await hre.ethers.provider.listAccounts()); 
        console.log('signer address: ', signerAddr);
        console.log('.');

        userDetails = [
            signerAddr,
            usdtAddrArb,
            defaultSlippage 
        ];

        WETH = await hre.ethers.getContractAt('IERC20', wethAddr);
        signers = await hre.ethers.getSigners();
    });

    describe('Optimistic deployment', async function () { 
        before( async () => {
            ([
                beacon, 
                beaconAddr, 
                ozERC1967proxyAddr, 
                storageBeacon, 
                storageBeaconAddr, 
                fakeOZLaddr, 
                varConfig, 
                eMode
            ] = await deploySystem('Optimistically', userDetails, signerAddr));
            storeVarsInHelpers(ozERC1967proxyAddr);

            proxyFactory = await hre.ethers.getContractAt(factoryABI, ozERC1967proxyAddr);
        });

        describe('ProxyFactory', async () => {
            describe('Deploys one proxy', async () => {
                it('should create a proxy successfully / createNewProxy()', async () => {
                    await proxyFactory.createNewProxy(userDetails);
                    newProxyAddr = (await storageBeacon.getProxyByUser(signerAddr))[0].toString(); 
                    assert.equal(newProxyAddr.length, 42);
                });

                it('should not allow to create a proxy with the 0 address / createNewProxy()', async () => {
                    userDetails[1] = nullAddr;
                    await assert.rejects(async () => {
                        await proxyFactory.createNewProxy(userDetails);
                    }, {
                        name: 'Error',
                        message: (await err()).zeroAddress 
                    });
                });

                it('should not allow to create a proxy with 0 slippage / createNewProxy()', async () => {
                    userDetails[1] = usdtAddrArb;
                    userDetails[2] = 0;
                    await assert.rejects(async () => {
                        await proxyFactory.createNewProxy(userDetails);
                    }, {
                        name: 'Error',
                        message: (await err()).zeroSlippage
                    });
                });

                it('should not allow to create a proxy with a userToken not found in the database / createNewProxy()', async () => {
                    userDetails[1] = deadAddr;
                    userDetails[2] = defaultSlippage;
                    await assert.rejects(async () => {
                        await proxyFactory.createNewProxy(userDetails);
                    }, {
                        name: 'Error',
                        message: (await err(deadAddr)).tokenNotFound
                    });
                })
    
                it('should have an initial balance of 0.01 ETH', async () => {
                    userDetails[1] = usdtAddrArb;
                    await proxyFactory.createNewProxy(userDetails);
                    newProxyAddr = (await storageBeacon.getProxyByUser(signerAddr))[0].toString();

                    await signers[0].sendTransaction({to: newProxyAddr, value: parseEther('0.01')});
                    balance = await hre.ethers.provider.getBalance(newProxyAddr);
                    assert.equal(formatEther(balance), '0.01');
                });
    
                it('should have a final balance of 0 ETH', async () => {
                    await proxyFactory.createNewProxy(userDetails);
                    newProxyAddr = (await storageBeacon.getProxyByUser(signerAddr))[0].toString();

                    await activateProxyLikeOps(newProxyAddr, ozERC1967proxyAddr); 
                    balance = await hre.ethers.provider.getBalance(newProxyAddr);
                    assert.equal(formatEther(balance), 0);
                });
            });


            describe('Deploys 5 proxies', async () => { 
                before(async () => {
                    userDetails[1] = usdcAddr;
                    for (let i=0; i < 5; i++) {
                        await proxyFactory.createNewProxy(userDetails);
                        newProxyAddr = (await storageBeacon.getProxyByUser(signerAddr))[i].toString(); 
                        usersProxies.push(newProxyAddr);
                        assert.equal(newProxyAddr.length, 42);
                    }
                    proxies = await storageBeacon.getProxyByUser(signerAddr);
                });

                it('deploys 5 proxies with an initial balance of 100 ETH each / createNewProxy()', async () => {
                    for (let i=0; i < proxies.length; i++) {
                        await signers[0].sendTransaction({to: proxies[i], value: parseEther('100')});
                        balance = await hre.ethers.provider.getBalance(proxies[i]);
                        assert.equal(formatEther(balance), '100.0');
                    }
                });
    
                it('should leave each of the 5 proxies with a final balance of 0 ETH / createNewProxy()', async () => {
                    for (let i=0; i < proxies.length; i++) {
                        await activateProxyLikeOps(proxies[i], ozERC1967proxyAddr);
                        balance = await hre.ethers.provider.getBalance(proxies[i]);
                        assert.equal(formatEther(balance), 0);
                    }
                });
            });
        });

        describe('ozBeaconProxy / ozPayMe', async () => {
            before(async () => {
                await proxyFactory.createNewProxy(userDetails);
                newProxyAddr = (await storageBeacon.getProxyByUser(signerAddr))[0].toString(); 
                newProxy = await hre.ethers.getContractAt(proxyABIeth, newProxyAddr);
            });

            describe('fallback()', async () => {
                it('should not allow re-calling / initialize()', async () => {
                    await assert.rejects(async () => {
                        await newProxy.initialize(0, nullAddr);
                    }, {
                        name: 'Error',
                        message: (await err()).alreadyInitialized 
                    });
                });

                it('should not allow when not Ops calls / sendToArb()', async () => {
                    await assert.rejects(async () => {
                        await activateOzBeaconProxy(newProxyAddr);
                    }, {
                        name: 'Error',
                        message: (await err(signerAddr)).notAuthorized 
                    });
                });

                it('should allow the user to change userToken / changeUserToken()', async () => {
                    tx = await newProxy.changeUserToken(usdcAddr);
                    receipt = await tx.wait();
                    newUserToken = getEventParam(receipt);
                    assert.equal(newUserToken, usdcAddr.toLowerCase());
                });

                it('should not allow an external user to change userToken / changeUserToken()', async () => {
                    await assert.rejects(async () => {
                        await newProxy.connect(signers[1]).changeUserToken(usdcAddr);
                    }, {
                        name: 'Error',
                        message: (await err(signerAddr2)).notAuthorized 
                    });
                });

                it('shoud not allow to change userToken for the 0 address / changeUserToken()', async () => {
                    await assert.rejects(async () => {
                        await newProxy.changeUserToken(nullAddr);
                    }, {
                        name: 'Error',
                        message: (await err()).zeroAddress
                    });
                });

                it('shoud not allow to change userToken for a token not found in the database / changeUserToken()', async () => {
                    await assert.rejects(async () => {
                        await newProxy.changeUserToken(deadAddr); 
                    }, {
                        name: 'Error',
                        message: (await err(deadAddr)).tokenNotFound
                    });
                });

                it('should allow the user to change userSlippage / changeUserSlippage()', async () => {
                    tx = await newProxy.changeUserSlippage(200);
                    receipt = await tx.wait();
                    newUserSlippage = getEventParam(receipt);
                    assert.equal(arrayify(newUserSlippage), '200');
                });

                it('should not allow to change userSlippage to 0 / changeUserSlippage()', async () => {
                    await assert.rejects(async () => {
                        await newProxy.changeUserSlippage(0);
                    }, {
                        name: 'Error',
                        message: (await err()).zeroSlippage
                    });
                });

                it('should not allow an external user to change userSlippage / changeUserSlippage()', async () => {
                    await assert.rejects(async () => {
                        await newProxy.connect(signers[1]).changeUserSlippage(200);
                    }, {
                        name: 'Error',
                        message: (await err(signerAddr2)).notAuthorized
                    });
                });

                it('should allow funds to be sent with correct userDetails even if malicious data was passed / sendToArb() - delegate()', async () => {
                    ops = await hre.ethers.getContractAt('IOps', pokeMeOpsAddr);

                    await ops.connect(signers[1]).createTaskNoPrepayment(
                        newProxyAddr,
                        0xaa309254, //first 4 bytes of sendToArb(tuplex2)
                        newProxyAddr,
                        0xcf5303cf, //first 4 bytes of checker()
                        ETH
                    );

                    await signers[0].sendTransaction({to: newProxyAddr, value: parseEther('0.01')});
                    receipt = await activateProxyLikeOps(newProxyAddr, signerAddr2, true, [evilVarConfig, evilUserDetails]);

                    balance = await hre.ethers.provider.getBalance(newProxyAddr);
                    assert.equal(balance.toString(), 0);

                    const areEqual = compareTopicWith(signerAddr, receipt);
                    assert(areEqual);
                });

                it('should emit the FundsToArb event with the proxy / sendToArb() - event FundsToArb()', async () => {
                    await signers[0].sendTransaction({to: newProxyAddr, value: parseEther('0.01')});
                    receipt = await activateProxyLikeOps(newProxyAddr, ozERC1967proxyAddr);
                    fundsToArbSignature = keccak256(toUtf8Bytes('FundsToArb(address,address,uint256)'));
                    isSign = compareTopicWith(fundsToArbSignature, receipt);
                    assert(isSign);
                });
            });
        });
    
        describe('StorageBeacon', async () => {
            it('shoud not allow an user to issue an userID / issueUserID()', async () => {
                await assert.rejects(async () => {
                    await storageBeacon.issueUserID(evilUserDetails);
                }, {
                    name: 'Error',
                    message: (await err(1)).notAuthorized 
                });
            });

            it('should not allow an user to save a proxy / saveUserProxy()', async () => {
                await assert.rejects(async () => {
                    await storageBeacon.saveUserProxy(signerAddr2, deadAddr);
                }, {
                    name: 'Error',
                    message: (await err(1)).notAuthorized 
                });
            });

            it('should not allow an user to save a taskId / saveTaskId()', async () => {
                await assert.rejects(async () => {
                    await storageBeacon.saveTaskId(deadAddr, formatBytes32String('evil data'));
                }, {
                    name: 'Error',
                    message: (await err(1)).notAuthorized 
                });
            });

            it('should allow the owner to change VariableConfig / changeVariableConfig()', async () => {
                await storageBeacon.changeVariableConfig(varConfig);
            });

            it('should not allow an external user to change VariableConfig / changeVariableConfig()', async () => {
                await assert.rejects(async () => {
                    await storageBeacon.connect(signers[1]).changeVariableConfig(varConfig);
                }, {
                    name: 'Error',
                    message: (await err()).notOwner 
                });
            });

            it('should allow the owner to add a new userToken to the database', async () => {
                await storageBeacon.addTokenToDatabase(fraxAddr);
            });

            it('should not allow an external user to add a new userToken to the database', async () => {
                await assert.rejects(async () => {
                    await storageBeacon.connect(signers[1]).addTokenToDatabase(deadAddr);
                }, {
                    name: 'Error',
                    message: (await err()).notOwner 
                });
            });

            it('should not allow re-calling / storeBeacon()', async () => {
                await assert.rejects(async () => {
                    await storageBeacon.storeBeacon(deadAddr);
                }, {
                    name: 'Error',
                    message: (await err(signerAddr)).alreadyInitialized 
                });
            });

            it('should allow the onwer to change Emergency Mode / changeEmergencyMode()', async () => {
                await storageBeacon.changeEmergencyMode(eMode);
            });

            it('should not allow an external user to change Emergency Mode / changeEmergencyMode()', async () => {
                await assert.rejects(async () => {
                    await storageBeacon.connect(signers[1]).changeEmergencyMode(eMode);
                }, {
                    name: 'Error',
                    message: (await err()).notOwner 
                });
            });

            it('should return the userDetails / getUserDetailsById()', async () => {
                await proxyFactory.createNewProxy(userDetails);
                userDetails[1] = usdtAddrArb;
                pulledUserDetails = await storageBeacon.getUserDetailsById(0);
                assert.equal(pulledUserDetails[0], userDetails[0]);
                assert.equal(pulledUserDetails[1], userDetails[1]);
                assert.equal(pulledUserDetails[2], userDetails[2]);
            });

            it('should return zero values when querying with a non-user / getUserDetailsById()', async () => {
                pulledUserDetails = await storageBeacon.getUserDetailsById(100);
                assert.equal(pulledUserDetails[0], nullAddr);
                assert.equal(pulledUserDetails[1], nullAddr);
                assert.equal(pulledUserDetails[2], 0);
            });

            it('should return the proxies an user has / getProxyByUser()', async () => {
                await proxyFactory.createNewProxy(userDetails);
                userProxies = await storageBeacon.getProxyByUser(signerAddr);
                assert(userProxies.length > 0);
            });

            it('should return an empty array when querying with a non-user / getProxyByUser()', async () => {
                userProxies = await storageBeacon.getProxyByUser(deadAddr);
                assert(userProxies.length === 0);
            });

            it("should get an user's taskID / getTaskID()", async () => {
                await proxyFactory.createNewProxy(userDetails);
                userProxies = await storageBeacon.getProxyByUser(signerAddr);
                taskID = (await storageBeacon.getTaskID(userProxies[0])).toString();
                assert(taskID.length > 0);
            });

            it("should return a zero taskID when querying with a non-user / getTaskID()", async () => {
                taskID = (await storageBeacon.getTaskID(deadAddr)).toString();
                assert.equal(taskID, formatBytes32String(0));
            });

            it('should return true for an user / isUser()', async () => {
                await proxyFactory.createNewProxy(userDetails);
                assert(await storageBeacon.isUser(signerAddr));
            });

            it('should return false for a non-user / isUser()', async () => {
                assert(!(await storageBeacon.isUser(deadAddr)));
            });

        });

        describe('ozUpgradeableBeacon', async () => {
            it('should allow the owner to upgrade the Storage Beacon / upgradeStorageBeacon()', async () => {
                [storageBeaconMockAddr , storageBeaconMock] = await deployContract('StorageBeaconMock');
                await beacon.upgradeStorageBeacon(storageBeaconMockAddr);
            });

            it('should not allow an external user to upgrade the Storage Beacon / upgradeStorageBeacon()', async () => {
                [storageBeaconMockAddr , storageBeaconMock] = await deployContract('StorageBeaconMock');
                signer2 = await hre.ethers.provider.getSigner(signerAddr2);

                await assert.rejects(async () => {
                    await beacon.connect(signers[1]).upgradeStorageBeacon(storageBeaconMockAddr);
                }, {
                    name: 'Error',
                    message: (await err()).notOwner
                });
            });

            it('should allow the owner to upgrade the implementation and use with the new version of storageBeacon / upgradeTo()', async () => {
                [ storageBeaconMockAddr ] = await deployContract('StorageBeaconMock');
                await beacon.upgradeStorageBeacon(storageBeaconMockAddr);
                const [ implMockAddr ] = await deployContract('ImplementationMock');
                await beacon.upgradeTo(implMockAddr);

                //execute a normal tx to the proxy and read from the new variable placed on implMock
                await proxyFactory.createNewProxy(userDetails);
                newProxyAddr = (await storageBeacon.getProxyByUser(signerAddr))[0].toString();
                
                await signers[0].sendTransaction({to: newProxyAddr, value: parseEther('1.5')});
                balance = await hre.ethers.provider.getBalance(newProxyAddr);
                assert.equal(formatEther(balance), '1.5');

                receipt = await activateProxyLikeOps(newProxyAddr, ozERC1967proxyAddr); 
                balance = await hre.ethers.provider.getBalance(newProxyAddr);
                assert.equal(formatEther(balance), 0);  

                isExist = await compareEventWithVar(receipt, 11);
                assert(isExist);
            });
        });
    });


    //autoRedeem set to 0
    describe('Pesimistic deployment', async function () {
        before( async () => {
            ([
                beacon, 
                beaconAddr, 
                ozERC1967proxyAddr, 
                storageBeacon, 
                storageBeaconAddr, 
                fakeOZLaddr, 
                varConfig, 
                eMode
            ] = await deploySystem('Pessimistically', userDetails, signerAddr));

            storeVarsInHelpers(ozERC1967proxyAddr);

            proxyFactory = await hre.ethers.getContractAt(factoryABI, ozERC1967proxyAddr);
            await proxyFactory.createNewProxy(userDetails);
            newProxyAddr = (await storageBeacon.getProxyByUser(signerAddr))[0].toString(); 
            newProxy = await hre.ethers.getContractAt(proxyABIeth, newProxyAddr);
            USDC = await hre.ethers.getContractAt('IERC20', usdcAddr);
        });

        describe('ozBeaconProxy / ozPayMe', async () => {
            it('should create a proxy successfully / createNewProxy()', async () => {
                assert.equal(newProxyAddr.length, 42);
            });

            it('should have an initial balance of 100 ETH', async () => {
                await signers[0].sendTransaction({to: newProxyAddr, value: parseEther('100')});
                balance = await hre.ethers.provider.getBalance(newProxyAddr);
                assert.equal(formatEther(balance), '100.0');
            });

            it('should run EmergencyMode successfully / _runEmergencyMode()', async () => {
                balance = await USDC.balanceOf(signerAddr);
                assert.equal(Number(balance), 0);

                await signers[0].sendTransaction({to: newProxyAddr, value: parseEther('100')});
                await activateProxyLikeOps(newProxyAddr, ozERC1967proxyAddr); 
                balance = await USDC.balanceOf(signerAddr);
                assert(Number(balance) > 0);
            });

            it("should send the ETH back to the user as last resort / _runEmergencyMode()", async () => {
                //UserSlippage is change to 1 to produce a slippage error derived from priceMinOut calculation
                await signers[0].sendTransaction({to: newProxyAddr, value: parseEther('100')});
                await newProxy.changeUserSlippage(1);

                preBalance = await WETH.balanceOf(signerAddr);
                assert.equal(preBalance, 0);
                await activateProxyLikeOps(newProxyAddr, ozERC1967proxyAddr); 
                postBalance = await WETH.balanceOf(signerAddr);
                assert(postBalance > 0);

                //Clean up
                await WETH.transfer(deadAddr, postBalance);
            });

            it('should execute the USDC swap in the second attempt / FaultyOzPayMe - _runEmergencyMode()', async () => {
                const [ faultyOzPayMeAddr ] = await deployContract('FaultyOzPayMe');
                await beacon.upgradeTo(faultyOzPayMeAddr);
                await newProxy.changeUserSlippage(defaultSlippage);
                
                await signers[0].sendTransaction({to: newProxyAddr, value: parseEther('100')});

                preBalance = await USDC.balanceOf(signerAddr);
                receipt = await activateProxyLikeOps(newProxyAddr, ozERC1967proxyAddr); 
                postBalance = await USDC.balanceOf(signerAddr);
                assert(preBalance < postBalance);

                isExist = await compareEventWithVar(receipt, 23);
                assert(isExist);
            });

            /**
             * Modifies the selector in the calldata of setTestReturnContract() for changeUserSlippage()
             * so it passes the filter of newProxy and goes to changeUserSlippage() instead of sendToArb().
             * 
             * Check changeUserSlippage() on FaultyOzPayMe2
             */
            it('should send ETH back to the user when the emergency swap returns 0 at the 2nd attempt / FaultyOzPayMe2 - _runEmergencyMode()', async () => {
                const [ faultyOzPayMe2Addr ] = await deployContract('FaultyOzPayMe2');
                await beacon.upgradeTo(faultyOzPayMe2Addr);       
                const [ testReturnAddr ] = await deployContract('TestReturn');

                iface = new ethers.utils.Interface(proxyABIeth);
                selectorTest = iface.getSighash('setTestReturnContract');
                selectorSlipp = iface.getSighash('changeUserSlippage');
                
                position = keccak256(toUtf8Bytes('test.position'));
                encodedData = iface.encodeFunctionData('setTestReturnContract', [
                    testReturnAddr,
                    position
                ]);
                changedData = encodedData.replace(selectorTest, selectorSlipp);
                
                await signers[0].sendTransaction({
                    to: newProxyAddr,
                    data: changedData
                });

                await signers[0].sendTransaction({to: newProxyAddr, value: parseEther('100')});

                preBalance = await WETH.balanceOf(signerAddr);
                assert.equal(preBalance, 0);
                receipt = await activateProxyLikeOps(newProxyAddr, ozERC1967proxyAddr); 
                postBalance = await WETH.balanceOf(signerAddr);
                assert(postBalance > 0);

                isExist = await compareEventWithVar(receipt, 23);
                assert(isExist);

                //Clean up
                await WETH.transfer(deadAddr, postBalance);
            });
        });
    });
  });