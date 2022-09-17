const { ethers, providers, Wallet } = require("ethers");
const { parseEther, formatEther, defaultAbiCoder: abiCoder, keccak256 } = ethers.utils;
const { deploy } = require('./deploy.js');
const { Bridge } = require('arb-ts');
const { L1TransactionReceipt, L1ToL2MessageStatus } = require('@arbitrum/sdk');
const { hexDataLength } = require('@ethersproject/bytes');
require('dotenv').config();

const {
    balanceOfOZL, 
    transferOZL, 
    withdrawShareOZL, 
    getVarsForHelpers,
    sendETH,
    getCalldata,
    getCalldata2
} = require('./helpers-arb.js');

const { getArbitrumParams } = require('./helpers-eth.js');

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
    l2ProviderTestnet
 } = require('./state-vars.js');




//-----------------------------------------


async function sendTx(receiver, isAmount, method, args) {
    const signer = await hre.ethers.provider.getSigner(0);
    const txDetails = {
        to: receiver,
        gasLimit: ethers.BigNumber.from('5000000'),
        gasPrice: ethers.BigNumber.from('40134698068')
    };
    const signatures = {
        createNewProxy: 'function createNewProxy(tuple(address user, address userToken, uint256 userSlippage) userDetails_)',
        getTaskID: 'function getTaskID(address proxy_) returns (bytes32)',
        sendToArb: 'function sendToArb()',
        initialize: 'function initialize(address beacon_)',
        _setBeacon: 'function _setBeacon(address beacon, bytes memory data)' 
    };

    if (isAmount) txDetails.value = ethers.utils.parseEther('0.01'); //0.01 - 9800 (fails with curreny slippage)
    if (args) {
        const abi = [];
        let signature; 
        let data;

        for (let sign in signatures) {
            if (sign === method) {
                signature = signatures[sign];
            }
        }
        abi.push(signature);
        const iface = new ethers.utils.Interface(abi);
        if (args === 1) {
            data = iface.encodeFunctionData(method);     
        } else {
            data = iface.encodeFunctionData(method, args); 
        }
        txDetails.data = data;
    }

    const tx = await signer.sendTransaction(txDetails);
    const receipt = await tx.wait();
    console.log(`${method} with hash: `, receipt.transactionHash);
}




async function calculateMaxGas(
    userDetails, managerAddr, value, maxSubmissionCost, gasPriceBid
) {
    const data = getCalldata('exchangeToUserToken', [userDetails]);
    const depositAmount = parseEther('0.1');
    const nodeAddr = '0x00000000000000000000000000000000000000C8';
    const nodeInterface = await (
        await hre.ethers.getContractAt('NodeInterface', nodeAddr)
    ).connect(l2Signer);

    let [maxGas]  = await nodeInterface.estimateRetryableTicket(
        userDetails[0],
        depositAmount,
        managerAddr,
        value,
        maxSubmissionCost,
        managerAddr,
        managerAddr,
        3000000,
        gasPriceBid,
        data
    );
    maxGas = maxGas.toString();
    console.log('maxGas: ', maxGas);

    return maxGas; 
}



async function getGasDetailsL2(userDetails) {
    const nitroInboxRinkeby = '0x578BAde599406A8fE3d24Fd7f7211c0911F5B29e';
    const abi = ['function calculateRetryableSubmissionFee(uint256 dataLength, uint256 baseFee) public view returns (uint256)']; 
    const delayedInbox = await hre.ethers.getContractAt(abi, nitroInboxRinkeby);

    const sendToArbBytes = ethers.utils.defaultAbiCoder.encode(
        ['tuple(address, address, uint256)'],
        [userDetails]
    );
    const sendToArbBytesLength = hexDataLength(sendToArbBytes) + 4;

    const _submissionPriceWei = await delayedInbox.connect(l1Signer).calculateRetryableSubmissionFee(
        sendToArbBytesLength,
        0
    );
  
    let submissionPriceWei = _submissionPriceWei.mul(5);
    submissionPriceWei = ethers.BigNumber.from(submissionPriceWei).mul(100)

    let gasPriceBid = await l2ProviderTestnet.getGasPrice();
    gasPriceBid = gasPriceBid.add(ethers.BigNumber.from(gasPriceBid).div(2));

    return {
        submissionPriceWei,
        gasPriceBid
    }
}





async function deployContract(contractName, signer, constrArgs) {
    const Contract = await hre.ethers.getContractFactory(contractName);

    const ops = {
        gasLimit: ethers.BigNumber.from('5000000'),
        gasPrice: ethers.BigNumber.from('40134698068')
    };

    let contract;
    let var1, var2, var3, var4;

    switch(contractName) {
        case 'UpgradeableBeacon':
            contract = await Contract.connect(signer).deploy(constrArgs, ops);
            break;
        case 'ozUpgradeableBeacon':
        case 'ozERC1967Proxy':
        case 'RolesAuthority':
            ([ var1, var2 ] = constrArgs);
            contract = await Contract.connect(signer).deploy(var1, var2, ops);
            break;
        case 'ozERC1967Proxy':
            ([ var1, var2, var3 ] = constrArgs);
            contract = await Contract.connect(signer).deploy(var1, var2, var3, ops);
            break;
        case 'StorageBeacon':
            ([ var1, var2, var3, var4 ] = constrArgs);
            contract = await Contract.connect(signer).deploy(var1, var2, var3, var4, ops);
            break;
        default:
            contract = await Contract.connect(signer).deploy(ops);
    }

    await contract.deployed();
    console.log(`${contractName} deployed to: `, contract.address);

    return [
        contract.address,
        contract
    ];
}



async function getTheTask() {
    const storageBeaconAddr = '0x5Eacb393D34618157989532Fd91a56d77f85FdE5';
    const newProxyAddr = '0xe510Dc3e577D8f50930360778b887fE50012E0d2';
    const sBeacon = await hre.ethers.getContractAt('StorageBeacon', storageBeaconAddr);

    const ops = {
        gasLimit: ethers.BigNumber.from('5000000'),
        gasPrice: ethers.BigNumber.from('40134698068')
    };

    const taskId = await sBeacon.taskIDs(newProxyAddr, ops);
    console.log('task id: *****', taskId.toString());
    //check why the task id on the terminal (rinkeby) is 0x0000

}

// getTheTask();


async function manualRedeem() {
    const txHash = '0xa5feb8901205b12c4a586ceec36b39356fb6b50f99d01de1d18ab3835dd359bb';
    const l1Provider = new providers.JsonRpcProvider(process.env.RINKEBY);
    const l2Provider = new providers.JsonRpcProvider(process.env.ARB_TESTNET);
    const l2Wallet = new Wallet(process.env.PK, l2Provider);

    const receipt = await l1Provider.getTransactionReceipt(txHash);
    const l1Receipt = new L1TransactionReceipt(receipt);
    const message = await l1Receipt.getL1ToL2Message(l2Wallet);
    const status = (await message.waitForStatus()).status;

    if (status === L1ToL2MessageStatus.REDEEMED) {
        console.log(`L2 retryable txn is already executed 🥳 ${message.l2TxHash}`)
        return
      } else {
        console.log(
          `L2 retryable txn failed with status ${L1ToL2MessageStatus[status]}`
        )

        await message.redeem({
            gasLimit: ethers.BigNumber.from('5000000'),
            gasPrice: ethers.BigNumber.from('40134698068')
        });

        console.log(
            'The L2 side of your transaction is now execeuted 🥳 :',
            message.l2TxHash
          )
      }

}

// manualRedeem();


async function redeemHashes() {
    const l2Wallet = new Wallet(process.env.PK, l2ProviderTestnet);

    const RedeemedHashes = await hre.ethers.getContractFactory('RedeemedHashes');
    const redeemedHashes = await RedeemedHashes.connect(l2Wallet).deploy();
    await redeemedHashes.deployed();
    console.log('redeemedHashes deployed to: ', redeemedHashes.address);
}

// redeemHashes();









//Deploys ozPayMe in mainnet and routes ETH to Manager (OZL) in Arbitrum
async function sendArb() { //mainnet
    const signerAddr = await signerX.getAddress();
    console.log('signer address: ', signerAddr);

    const userDetails = [
        signerAddr,
        usdtAddrArb,
        defaultSlippage
    ];
    
    let constrArgs = [];
    
    //Deploys the fake OZL on arbitrum testnet 
    // const [ fakeOZLaddr ] = await deployContract('FakeOZL', l2Signer); //fake OZL address in arbitrum
    const fakeOZLaddr = '0x0FDe6518Ee375984944D28962AF32D1d7084736c';
    console.log('fakeOZL deployed to: ', fakeOZLaddr);
   
    //Calculate fees on L1 > L2 arbitrum tx - **** (add TRUE as 2nd param for manual redeem) ****
    let [ maxSubmissionCost, gasPriceBid, maxGas, autoRedeem ] = await getArbitrumParams(userDetails, true);

    //Deploys ozPayMe in mainnet
    const [ ozPaymeAddr ] = await deployContract('ozPayMe', l1Signer);

    //Deploys StorageBeacon
    const fxConfig = [
        inbox, 
        pokeMeOpsAddr,
        fakeOZLaddr,
        gelatoAddr, 
        ETH,
        maxGas
    ];

    const varConfig = [
        maxSubmissionCost,
        gasPriceBid,
        autoRedeem
    ];

    const eMode = [
        swapRouterUniAddr,
        chainlinkAggregatorAddr,
        poolFeeUni,
        wethAddr,
        usdcAddr
    ];


    const tokensDatabase = [
        usdtAddrArb
    ];

    constrArgs = [
        fxConfig,
        varConfig,
        eMode,
        tokensDatabase
    ]; 

    const [ storageBeaconAddr, storageBeacon ] = await deployContract('StorageBeacon', l1Signer, constrArgs);

    //Deploys UpgradeableBeacon
    constrArgs = [
        ozPaymeAddr,
        storageBeaconAddr
    ];

    const [ beaconAddr, beacon ] = await deployContract('ozUpgradeableBeacon', l1Signer, constrArgs); 
    await storageBeacon.storeBeacon(beaconAddr);

    //Deploys ProxyFactory
    const [proxyFactoryAddr] = await deployContract('ProxyFactory', l1Signer);

    //Deploys ozERC1967Proxy
    constrArgs = [
        proxyFactoryAddr,
        '0x'
    ];

    const [ ozERC1967proxyAddr ] = await deployContract('ozERC1967Proxy', l1Signer, constrArgs);
    await sendTx(ozERC1967proxyAddr, false, 'initialize', [beaconAddr]);

    //Deploys Auth
    constrArgs = [
        signerAddr,
        beaconAddr
    ];

    const [ rolesAuthorityAddr, rolesAuthority ] = await deployContract('RolesAuthority', l1Signer, constrArgs);
    const ops = {
        gasLimit: ethers.BigNumber.from('5000000'),
        gasPrice: ethers.BigNumber.from('40134698068')
    };
    await beacon.setAuth(rolesAuthorityAddr, ops);

    //Set ERC1967Proxy to role 1 and gives it authority to call the functions in StorageBeacon
    await rolesAuthority.setUserRole(ozERC1967proxyAddr, 1, true, ops);

    await rolesAuthority.setRoleCapability(1, storageBeaconAddr, '0x74e0ea7a', true, ops); //issueUserID(UserConfig memory userDetails_)
    await rolesAuthority.setRoleCapability(1, storageBeaconAddr, '0x68e540e5', true, ops); //saveUserProxy(address sender_, address proxy_)
    await rolesAuthority.setRoleCapability(1, storageBeaconAddr, '0xf2034a69', true, ops); //saveTaskId(address proxy_, bytes32 id_)

    //Creates 1st proxy
    await sendTx(ozERC1967proxyAddr, false, 'createNewProxy', [userDetails]);
    const newProxyAddr = (await storageBeacon.getProxyByUser(signerAddr))[0].toString(); 
    console.log('proxy 1: ', newProxyAddr);

    //Set signerAddr to role 0 for calling disableEmitter() on ozPayMe
    await rolesAuthority.setUserRole(signerAddr, 0, true, ops);
    await rolesAuthority.setRoleCapability(0, newProxyAddr, '0xa2d4d48b', true, ops); //disableEmitter()

    //Gets user's task id
    const taskId = await storageBeacon.getTaskID(newProxyAddr, ops);
    console.log('task id: ', taskId.toString());

    //**** TRIGGER for Gelato *******/
    // await sendTx(newProxyAddr, true, 'Sending ETH');

    //Comment out this part when trying it out with Gelato
    // let ethBalance = await hre.ethers.provider.getBalance(newProxyAddr);
    // console.log('pre eth balance on proxy: ', ethBalance.toString());

    // await sendTx(newProxyAddr, false, 'sendToArb', 1);

    // ethBalance = await hre.ethers.provider.getBalance(newProxyAddr);
    // console.log('post eth balance on proxy: ', ethBalance.toString());


    //for eMode
    // const USDT = await hre.ethers.getContractAt('IERC20', usdcAddr);
    // const bal = await USDT.balanceOf(signerAddr);
    // console.log('USDC user balance: ', bal.toString() / 10 ** 6);

    // bal2 = await hre.ethers.provider.getBalance(addr2);
    // console.log('bal2 post *******: ', bal2.toString());

}




async function testBeacon() {
    // const beaconAddr = '0xE0ab317b5D7AD571872B025aB6eAE9E60d082467';
    // const beacon = await hre.ethers.getContractAt('UpgradeableBeacon', beaconAddr);
    // const impl = await beacon.implementation();
    // console.log('impl: ', impl.toString());


    // const factoryAddr = '0x98b4CCF3CC16932cEe79b73F412Bb40c1A186CFc';
    // const factory = await hre.ethers.getContractAt('ProxyFactory', factoryAddr);
    // const num = await factory.num();
    // console.log('num: ', num.toString());


    const paymeAddr = '0x231046D81d9B4d28511a9Cb8035d63C1BA3A38a8';
    const payme = await hre.ethers.getContractAt('BeaconProxy', paymeAddr);
    const num = await payme.n();
    console.log('num2: ', num.toString());


}

// testBeacon(); 





async function getCount() {
    const signerAddr = await signerX.getAddress();

    const latest = await hre.ethers.provider.getTransactionCount(signerAddr,'pending');
    console.log('x: ', latest);

}

// getCount();


async function getTask() {

    const storageBeaconAddr = '0xa6aA583E1Ab33F9E7ED99560e1dfD211332F7FbB';
    const storageBeacon = await hre.ethers.getContractAt('StorageBeacon', storageBeaconAddr);
    const proxy = '0xdF102a7cE11B1Da5e89Ae29230742c50A559Bcbe';

    const task = await storageBeacon.getTaskID(proxy);
    console.log('task: ', task);

}

// getTask();


async function callSendToArb() {
    const abi = ['function sendToArb() external payable'];
    const proxyAddr = '0x9Af884C0b76E7A260a6938dc0791e5C1d3034156';
    const proxy = await hre.ethers.getContractAt(abi, proxyAddr);

    const tx = await proxy.sendToArb();
    const receipt = await tx.wait();
    console.log('hash: ', receipt.transactionHash);

}

// callSendToArb();










// createTask();

// tryGelatoRopsten();


sendArb();

// tryPrecompile();

// sendTx('0x8A63AcA6622B6B32ea76c378f38fd5D6182ADD18');
// sendTx('0xcDFfcc5DE7ee15d46080a813509aB237CC62cDB9');
// sendTx('0xfb3744F7dcd34EC11d262A3925a1E6ea6412d751');
// sendTx('0xf9FE99ddBAbb08f4332e9AC9F256C006231EeC8F');



//new with emitter and maxGas: 0xBb8FDbD6D27b39B62A55e38974B3CFA7430A1fb9
//new with emitter and 10 instead of maxGas: 0xAd467bbB7c72B04EAbCBC9CEBdc27e5A3029e308

// impersonateTx();

// .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });
  

// buffering();

