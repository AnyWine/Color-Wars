import artifact from "@/artifacts/ColorWarsV1.json";
import { PACKS } from "@/lib/game-config";

export const COLOR_WARS_V1_ABI = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "packId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "pixels",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "PixelsPurchased",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "packId",
        type: "uint256",
      },
    ],
    name: "buyPixels",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    stateMutability: "payable",
    type: "receive",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "packs",
    outputs: [
      {
        internalType: "uint256",
        name: "pixels",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "price",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
    ],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
export const COLOR_WARS_V1_BYTECODE = artifact.bytecode;

export const PACK_BY_ID = Object.fromEntries(PACKS.map((pack) => [pack.id, pack])) as Record<
  (typeof PACKS)[number]["id"],
  (typeof PACKS)[number]
>;

export const PACK_BY_PIXELS = Object.fromEntries(PACKS.map((pack) => [pack.px, pack])) as Record<
  (typeof PACKS)[number]["px"],
  (typeof PACKS)[number]
>;
