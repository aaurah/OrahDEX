require("@nomicfoundation/hardhat-ethers");
const path = require("node:path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

const root = __dirname;
const hardhatEntry = require.resolve("hardhat");
const localSolc = require.resolve("solc/soljson.js", {
  paths: [path.dirname(hardhatEntry)],
});
const longVersion = require(require.resolve("solc", {
  paths: [path.dirname(hardhatEntry)],
})).version();
const localVersion = longVersion.split("+")[0];

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(
  async ({ solcVersion }, _hre, runSuper) => {
    if (solcVersion === localVersion) {
      return {
        compilerPath: localSolc,
        isSolcJs: true,
        version: localVersion,
        longVersion,
      };
    }
    return runSuper();
  },
);

module.exports = {
  solidity: {
    version: localVersion,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: { hardhat: {} },
  paths: {
    sources: path.join(root, "contracts"),
    tests: path.join(root, "test"),
    cache: "/tmp/orahdex-hardhat-cache",
    artifacts: "/tmp/orahdex-hardhat-artifacts",
  },
  mocha: { timeout: 60_000 },
};
