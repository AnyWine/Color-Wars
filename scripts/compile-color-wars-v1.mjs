import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import solc from "solc";

const root = process.cwd();
const contractPath = path.join(root, "contracts", "ColorWarsV1.sol");
const artifactPath = path.join(root, "artifacts", "ColorWarsV1.json");

const source = await readFile(contractPath, "utf8");

const input = {
  language: "Solidity",
  sources: {
    "ColorWarsV1.sol": {
      content: source,
    },
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors?.some((entry) => entry.severity === "error")) {
  for (const entry of output.errors) {
    console.error(entry.formattedMessage);
  }

  process.exit(1);
}

const contract = output.contracts["ColorWarsV1.sol"].ColorWarsV1;

await mkdir(path.dirname(artifactPath), { recursive: true });
await writeFile(
  artifactPath,
  JSON.stringify(
    {
      contractName: "ColorWarsV1",
      abi: contract.abi,
      bytecode: `0x${contract.evm.bytecode.object}`,
    },
    null,
    2,
  ),
);

console.log(`Wrote artifact to ${artifactPath}`);
