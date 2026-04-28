// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ColorWarsV1 {
    address public owner;

    struct Pack {
        uint256 pixels;
        uint256 price;
    }

    mapping(uint256 => Pack) public packs;

    event PixelsPurchased(
        address indexed user,
        uint256 packId,
        uint256 pixels,
        uint256 value
    );

    constructor() {
        owner = msg.sender;

        packs[1] = Pack(100, 0.0005 ether);
        packs[2] = Pack(500, 0.0025 ether);
        packs[3] = Pack(1000, 0.005 ether);
    }

    function buyPixels(uint256 packId) external payable {
        Pack memory pack = packs[packId];
        require(pack.pixels > 0, "Invalid pack");
        require(msg.value == pack.price, "Wrong ETH");

        emit PixelsPurchased(msg.sender, packId, pack.pixels, msg.value);
    }

    receive() external payable {}

    function withdraw(address to) external {
        require(msg.sender == owner, "Not owner");
        payable(to).transfer(address(this).balance);
    }
}
