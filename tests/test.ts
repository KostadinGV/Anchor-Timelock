import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { First } from '../target/types/first';

import {
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

import { TOKEN_PROGRAM_ID, Token, AccountLayout } from "@solana/spl-token";
import { assert } from "chai";

describe('test', () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const firstProgram = anchor.workspace.First as Program<First>;

  let tokenMint = null;

  let userTokenAccount = null;
  let user1TokenAccount = null;

  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();
  const user1 = anchor.web3.Keypair.generate();

  const tokenSupply = 1000000000000;

  const userTokenAmount = 1000;
  const user1TokenAmount = 2000;

  const lockTime = 1645455047;

  const userWithdrawAmount = 500;

  it('Is initialized!', async () => {
    // Add your test here.
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(admin.publicKey, 1000000000),
      "confirmed"
    );
    await provider.send(
      (() => {
        const tx = new Transaction();
        tx.add(
          SystemProgram.transfer({
            fromPubkey: admin.publicKey,
            toPubkey: user.publicKey,
            lamports: 100000000,
          })
        );
        return tx;
      })(),
      [admin]
    );
    await provider.send(
      (() => {
        const tx = new Transaction();
        tx.add(
          SystemProgram.transfer({
            fromPubkey: admin.publicKey,
            toPubkey: user1.publicKey,
            lamports: 100000000,
          })
        );
        return tx;
      })(),
      [admin]
    );

    tokenMint = await Token.createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    userTokenAccount = await tokenMint.createAccount(user.publicKey);
    user1TokenAccount = await tokenMint.createAccount(user1.publicKey);
    await tokenMint.mintTo(
      userTokenAccount,
      admin.publicKey,
      [admin],
      userTokenAmount
    );
    await tokenMint.mintTo(
      user1TokenAccount,
      admin.publicKey,
      [admin],
      user1TokenAmount
    );
    let userTokenInfo = await tokenMint.getAccountInfo(userTokenAccount);
    let user1TokenInfo = await tokenMint.getAccountInfo(user1TokenAccount);

    assert.ok(userTokenInfo.amount.toNumber() == userTokenAmount);
    assert.ok(user1TokenInfo.amount.toNumber() == user1TokenAmount);


  });
  it("Initialize", async () => {
    const [_lock_time_pda, _lock_time_pda_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(("lock-time")), admin.publicKey.toBuffer()],
      firstProgram.programId
    );
    const [_vault_pda, _vault_pda_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(("vault")), admin.publicKey.toBuffer()],
      firstProgram.programId
    );
    let txHash = await firstProgram.rpc.initialize(
      _lock_time_pda_bump,
      _vault_pda_bump,
      new anchor.BN(lockTime),
      {
        accounts: {
          owner: admin.publicKey,
          sourceTokenMint: tokenMint.publicKey,
          vaultAccount: _vault_pda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          lockTimeAccount: _lock_time_pda,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [admin],
      }
    );
    console.log("txHash =", txHash);
  });
  it("Deposit", async () => {
    const [_user_staker_pda, _user_staker_pda_bump] = await PublicKey.findProgramAddress(
      [Buffer.from("staker"), user.publicKey.toBuffer()],
      firstProgram.programId
    );
    const [_user1_staker_pda, _user1_staker_pda_bump] = await PublicKey.findProgramAddress(
      [Buffer.from("staker"), user1.publicKey.toBuffer()],
      firstProgram.programId
    );
    const [_vault_pda, _vault_pda_bump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), admin.publicKey.toBuffer()],
      firstProgram.programId
    );

    await firstProgram.rpc.deposit(
      _user_staker_pda_bump,
      new anchor.BN(userTokenAmount),
      {
        accounts: {
          owner: user.publicKey,
          sourceTokenAccount: userTokenAccount,
          sourceTokenMint: tokenMint.publicKey,
          tokenVaultAccount: _vault_pda,
          tokenStaker: _user_staker_pda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId
        },
        signers: [user]
      });
    await firstProgram.rpc.deposit(
      _user1_staker_pda_bump,
      new anchor.BN(user1TokenAmount),
      {
        accounts: {
          owner: user1.publicKey,
          sourceTokenAccount: user1TokenAccount,
          sourceTokenMint: tokenMint.publicKey,
          tokenVaultAccount: _vault_pda,
          tokenStaker: _user1_staker_pda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId
        },
        signers: [user1]
      });
  });

  it("Claim", async () => {
    const [_time_lock_pda, _time_lock_pda_bump] = await PublicKey.findProgramAddress(
      [Buffer.from("lock-time"), admin.publicKey.toBuffer()],
      firstProgram.programId
    );
    const [_vault_pda, _vault_pda_bump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), admin.publicKey.toBuffer()],
      firstProgram.programId
    );
    const [_user_staker_pda, _user_staker_pda_bump] = await PublicKey.findProgramAddress(
      [Buffer.from("staker"), user.publicKey.toBuffer()],
      firstProgram.programId
    );
    const [_vault_authority_pda, _vault_authority_pda_bump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault-authority")],
      firstProgram.programId
    );
    await firstProgram.rpc.claim(
      new anchor.BN(userWithdrawAmount),
      {
        accounts: {
          owner: user.publicKey,
          destTokenAccount: userTokenAccount,
          tokenMint: tokenMint.publicKey,
          tokenVaultAccount: _vault_pda,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenStaker: _user_staker_pda,
          vaultAuthority: _vault_authority_pda,
          lockTimeAccount: _time_lock_pda,
        },
        signers: [user]
      }
    );

    let _userTokenAccount = await tokenMint.getAccountInfo(userTokenAccount);
    let _user1TokenAccount = await tokenMint.getAccountInfo(user1TokenAccount);
    console.log(_userTokenAccount.amount.toNumber());
    console.log(_user1TokenAccount.amount.toNumber());
    assert.ok(_userTokenAccount.amount.toNumber() == userWithdrawAmount);
    assert.ok(_user1TokenAccount.amount.toNumber() == 0);
  });
});
