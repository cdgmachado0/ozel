const { deployedDiamond } = require('./deploy.js');
// let {deployedDiamond} = require('./stateVars.js');


// function logDiamond() {
//     console.log('diamond: ', deployedDiamond);
// }

// function getDeployedDiamond(deployedDiamond) {
//     return deployedDiamond
// }

//trying to get deployedDiamond from --------------------------------------->
//to here (circular dependency)

async function callDiamondProxy(params) { //put this params in one obj
    const signers = await hre.ethers.getSigners();
    const signer = signers[params.signerIndex === undefined ? 0 : params.dir];
    const abi = [];
    let iface;
    let encodedData;
    const callArgs = [];
    let tx;
    let decodedData;
    let signature;
    const signatures = {
        transferToManager: 'function transferToManager(address _user, address _userToken)', //delete if not used
        getDistributionIndex: 'function getDistributionIndex() returns (uint256)',
        balanceOf: 'function balanceOf(address account) view returns (uint256)',
        transfer: 'function transfer(address recipient, uint256 amount) returns (bool)',
        exchangeToUserToken: 'function exchangeToUserToken(uint _amount, address _user, address _userToken)',
        withdrawUserShare: 'function withdrawUserShare(address _user, uint _userAllocation, address _userToken)'
    };
    // const path = params.dir === undefined ? 0 : params.dir; 

    for (let sign in signatures) {
        if (sign === params.method) {
            signature = signatures[sign];
        }
    }
    abi.push(signature);
    iface = new ethers.utils.Interface(abi);
    
    if (Object.keys(params.args).length < 2) {
        callArgs[0] = params.args[Object.keys(params.args)[0]];
    } else {
        let i = 0;
        for (let key in params.args) {
            callArgs[i] = params.args[key];
            i++;
        }
    }

    switch(params.dir === undefined ? 0 : params.dir) {
        case 0: 
            encodedData = iface.encodeFunctionData(params.method, callArgs);
            const unsignedTx = {
                to: deployedDiamond.address,
                data: encodedData
            };
            if (callArgs.length === 1) {
                tx = await signer.call(unsignedTx);
                [ decodedData ] = abiCoder.decode([params.type], tx);
                return decodedData;
            } else {
                if (iface.fragments[0].name === 'exchangeToUserToken') {
                    const estGas = await signer.estimateGas(unsignedTx);
                    unsignedTx.gasLimit = Math.floor(estGas.toString() * 1.10);
                }
                await signer.sendTransaction(unsignedTx);
                return;
            }
        case 1:
            encodedData = iface.encodeFunctionData(params.method);
            tx = await signer.sendTransaction({
                to: deployedDiamond.address,
                data: encodedData
            });
            const receipt = await tx.wait();
            const { data } = receipt.logs[0];
            [ decodedData ] = abiCoder.decode([params.type], data);
            return decodedData;
    }
}

async function balanceOfPYY(user) {
    return await callDiamondProxy({
        method: 'balanceOf',
        args: {user},
        dir: 0,
        type: 'uint256'
    }); 
}

async function transferPYY(recipient, amount) { 
    await callDiamondProxy({
        method: 'transfer',
        args: {recipient, amount},
    }); 
}

async function withdrawSharePYY(callerAddr, balancePYY, usdtAddr) {
    await callDiamondProxy({
        method: 'withdrawUserShare',
        args: {callerAddr, balancePYY, usdtAddr}
    });
}

async function approvePYY(caller) {
    const signer = await hre.ethers.provider.getSigner(caller);
    await PYY.connect(signer).approve(managerFacet.address, MaxUint256);
}


module.exports = {
    callDiamondProxy,
    balanceOfPYY,
    transferPYY,
    withdrawSharePYY,
    approvePYY
};