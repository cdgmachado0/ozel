const { ethers } = require('ethers');
const { defaultAbiCoder: abiCoder } = ethers.utils;
const axios = require('axios').default;

async function main() {
    const URL = 'https://api.thegraph.com/subgraphs/name/gelatodigital/poke-me-rinkeby';
    const query = (taskId) => {
        return {
            query: `
                {
                    tasks(where: {id: "${taskId}"}) {
                        id
                        taskExecutions {
                            id,
                            success
                        }
                    }
                }
            `
        }
    };
    const storageBeaconAddr = '0xD7F4e37632573455F48Ea1E468da0E6C6a4837Ff'; //good: 0xbAa31ba0aBFad51199e899900ea6E0b08Bd15304 / gasPriceBid = 0 - 0x8dDb2f87a8dE0d651CE662CBCf5d626f85B766B6 
    const storageBeacon = await hre.ethers.getContractAt('StorageBeacon', storageBeaconAddr);
    const proxy = '0x68F6059648048f24EB4c2f1b2b9606A716805B88'; //good: 0xAEa934d83F62d07BdAE032ecD1C3D7fA6C55fA04 / gasPriceBid = 0 - 0x2d0d5FEA1E54baB9a7574E2d7fC8E19afBA93540
    const failedHashes = [];
    //taskId of gasPriceBid = 0: 0xf6bd4e78ceb7e6406106747797e38819e59bc63c730800fb014c33806bf50b7a

    const filter = {
        address: proxy, 
        topics: [
            ethers.utils.id("FundsToArb(address,address,uint256)") 
        ]
    };

    console.log('listening...');
    await hre.ethers.provider.on(filter, async (encodedData) => {
        let codedProxy = encodedData.topics[1];
        let [ proxy ] = abiCoder.decode(['address'], codedProxy);
        const taskId = await storageBeacon.getTaskID(proxy);

        const result = (await axios.post(URL, query(taskId))).data.data;
        const executions =  result.tasks[0].taskExecutions;
        console.log('executions: ', executions);

        for (let i=0; i < executions.length; i++) {
            if (!executions[i].success) {
                let [ hash ] = executions[i].id.split(':');
                failedHashes.push(hash);
            }
        }

        console.log('failedHashes: ', failedHashes);
    });

}



main();