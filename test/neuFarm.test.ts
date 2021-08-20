import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { time } from "@openzeppelin/test-helpers";

describe("NeuFarm", () => {

    let owner: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let res: any;
    let neuFarm: Contract;
    let neuToken: Contract;
    let mockDai: Contract;

    const daiAmount: BigNumber = ethers.utils.parseEther("25000");

    beforeEach(async() => {
        const NeuFarm = await ethers.getContractFactory("NeuFarm");
        const NeuToken = await ethers.getContractFactory("NeuToken");
        const MockDai = await ethers.getContractFactory("MockERC20");
        mockDai = await MockDai.deploy("MockDAi", "mDAI");
        [owner, alice, bob] = await ethers.getSigners();
        await Promise.all([
            mockDai.mint(owner.address, daiAmount),
            mockDai.mint(alice.address, daiAmount),
            mockDai.mint(bob.address, daiAmount)
        ]);
        neuToken = await NeuToken.deploy();
        neuFarm = await NeuFarm.deploy(mockDai.address, neuToken.address);
    })

    describe("Init", async() => {
        it("should initialize", async() => {
            expect(neuToken).to.be.ok
            expect(neuFarm).to.be.ok
            expect(mockDai).to.be.ok
        })
    })

    describe("Stake", async() => {
        let toTransfer = ethers.utils.parseEther("100")

        it("should accept DAI and update mapping", async() => {
            await mockDai.connect(alice).approve(neuFarm.address, toTransfer)

            expect(await mockDai.allowance(alice.address, neuFarm.address))
                .to.eq(toTransfer)

            expect(await neuFarm.isStaking(alice.address))
                .to.eq(false)

            expect(await neuFarm.connect(alice).stake(toTransfer))
                .to.be.ok

            expect(await neuFarm.stakingBalance(alice.address))
                .to.eq(toTransfer)

            expect(await neuFarm.isStaking(alice.address))
                .to.eq(true)
        })

        it("should update balance with multiple stakes", async() => {
            await mockDai.connect(alice).approve(neuFarm.address, toTransfer)
            await neuFarm.connect(alice).stake(toTransfer)

            await mockDai.connect(alice).approve(neuFarm.address, toTransfer)
            await neuFarm.connect(alice).stake(toTransfer)

            expect(await neuFarm.stakingBalance(alice.address))
                .to.eq(ethers.utils.parseEther("200"))
        })

        it("should revert with not enough funds", async() => {
            toTransfer = ethers.utils.parseEther("1000000")
            await mockDai.approve(neuFarm.address, toTransfer)

            await expect(neuFarm.connect(bob).stake(toTransfer))
                .to.be.revertedWith("You cannot stake zero tokens")
        })

        it("should revert stake without allowance", async() => {
            toTransfer = ethers.utils.parseEther("100")
            await mockDai.connect(alice).approve(neuFarm.address, toTransfer)

            await expect(neuFarm.connect(alice).stake(ethers.utils.parseEther("200")))
                .to.be.revertedWith("ERC20: transfer amount exceeds allowance")
        })

        it("should revert stake with zero as staked amount", async() => {
            await expect(neuFarm.connect(alice).stake("0"))
                .to.be.revertedWith("You cannot stake zero tokens")
        })
    })

    describe("Unstake", async() => {

        beforeEach(async() => {
            let toTransfer = ethers.utils.parseEther("100")
            await mockDai.connect(alice).approve(neuFarm.address, toTransfer)
            await neuFarm.connect(alice).stake(toTransfer)
        })

        it("should unstake balance from user", async() => {
            let toTransfer = ethers.utils.parseEther("100")
            await neuFarm.connect(alice).unstake(toTransfer)

            res = await neuFarm.stakingBalance(alice.address)
            expect(Number(res))
                .to.eq(0)

            expect(await neuFarm.isStaking(alice.address))
                .to.eq(false)
        })

        it("should show the correct balance when unstaking some of the staked balance", async() => {
            let toTransfer = ethers.utils.parseEther("50")
            await neuFarm.connect(alice).unstake(toTransfer)

            expect(await neuFarm.stakingBalance(alice.address))
                .to.eq(toTransfer)

            expect(await neuFarm.stakingBalance(alice.address))
                .to.eq(toTransfer)
        })

        it("isStaking mapping should equate true when partially unstaking", async() => {
            let toTransfer = ethers.utils.parseEther("50")
            await neuFarm.connect(alice).unstake(toTransfer)

            expect(await neuFarm.isStaking(alice.address))
                .to.eq(true)

            expect(await neuFarm.stakingBalance(alice.address))
                .to.eq(toTransfer)

        })
    })

    describe("WithdrawYield", async() => {

        beforeEach(async() => {
            await neuToken._transferOwnership(neuFarm.address)
            let toTransfer = ethers.utils.parseEther("10")
            await mockDai.connect(alice).approve(neuFarm.address, toTransfer)
            await neuFarm.connect(alice).stake(toTransfer)
        })

        it("should return correct yield time", async() => {
            let timeStart = await neuFarm.startTime(alice.address)
            expect(Number(timeStart))
                .to.be.greaterThan(0)

            await time.increase(86400)

            expect(await neuFarm.calculateYieldTime(alice.address))
                .to.eq((86400))
        })

        it("should mint correct token amount in total supply and user", async() => {
            await time.increase(86400)

            let _time = await neuFarm.calculateYieldTime(alice.address)
            let formatTime = _time / 86400
            let staked = await neuFarm.stakingBalance(alice.address)
            let bal = staked * formatTime
            let newBal = ethers.utils.formatEther(bal.toString())
            let expected = Number.parseFloat(newBal).toFixed(3)

            await neuFarm.connect(alice).withdrawYield()

            res = await neuToken.totalSupply()
            let newRes = ethers.utils.formatEther(res)
            let formatRes = Number.parseFloat(newRes).toFixed(3).toString()

            expect(expected)
                .to.eq(formatRes)

            res = await neuToken.balanceOf(alice.address)
            newRes = ethers.utils.formatEther(res)
            formatRes = Number.parseFloat(newRes).toFixed(3).toString()

            expect(expected)
                .to.eq(formatRes)
        })

        it("should update yield balance when unstaked", async() => {
            await time.increase(86400)
            await neuFarm.connect(alice).unstake(ethers.utils.parseEther("5"))

            res = await neuFarm.neuBalance(alice.address)
            expect(Number(ethers.utils.formatEther(res)))
                .to.be.approximately(10, .001)
        })
    })
})
