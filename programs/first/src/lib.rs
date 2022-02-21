
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, SetAuthority, Mint, Transfer};
use spl_token::instruction::AuthorityType;
declare_id!("GQ9tD6hwnaHvSvwyFEEwKxHAhy3thvhiVFTE33LsKeye");

const UNLOCK_PERIOD : u64 = 0;
#[program]
pub mod first {

    use super::*;

    const VAULT_AUTHORITY_SEED: &[u8] = b"vault-authority";

    pub fn initialize(
        ctx: Context<Initialize>,
        _vault_account_bump: u8
    ) -> ProgramResult {
        let (vault_authority, _vault_authority_bump) = 
            Pubkey::find_program_address(&[VAULT_AUTHORITY_SEED], ctx.program_id);
        token::set_authority(
            ctx.accounts.into_set_authority_context(),
            AuthorityType::AccountOwner,
            Some(vault_authority)
        )?;
        Ok(())
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        _staker_account_bump: u8,
        amount: u64
    ) -> ProgramResult {
        let staker = &mut ctx.accounts.token_staker;
        staker.staked_amount += amount;
        staker.owner = *ctx.accounts.owner.key;
        staker.unlock_time = Clock::get()?.unix_timestamp as u64 + UNLOCK_PERIOD;

        token::transfer(
            ctx.accounts.into_token_transfer_context(),
            amount
        )?;
        Ok(())
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        amount: u64
    ) -> ProgramResult {
        let staker = &mut ctx.accounts.token_staker;
        let cur_time = Clock::get()?.unix_timestamp as u64;

        if cur_time < staker.unlock_time {
            return Err(CustomError::Locked.into());
        }

        if amount > staker.staked_amount {
            return Err(CustomError::ExceedAmount.into());
        }

        staker.staked_amount -= amount;

        let (_vault_authority, vault_authority_bump) =
            Pubkey::find_program_address(&[VAULT_AUTHORITY_SEED], ctx.program_id);
        let authority_seeds = &[&VAULT_AUTHORITY_SEED[..], &[vault_authority_bump]];

        token::transfer(
            ctx.accounts
                .into_token_transfer_context()
                .with_signer(&[&authority_seeds[..]]),
            amount
        )?;
        // with_signer []
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(_vault_account_bump: u8)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        seeds = [b"vault".as_ref(),owner.key.as_ref()],
        bump = _vault_account_bump,
        payer = owner,
        token::mint = source_token_mint,
        token::authority = owner,
    )]
    pub vault_account: Account<'info, TokenAccount>,
    pub source_token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>
}
#[derive(Accounts)]
#[instruction(_staker_account_bump: u8)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        seeds = [b"staker".as_ref(), owner.key.as_ref()],
        bump = _staker_account_bump,
        payer = owner
    )]
    pub token_staker: Account<'info, TokenStaker>,

    #[account(
        mut,
        constraint = source_token_account.mint == source_token_mint.key()
    )]
    pub source_token_account: Account<'info, TokenAccount>,
    pub source_token_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = token_vault_account.mint == source_token_mint.key()
    )]
    pub token_vault_account: Account<'info, TokenAccount>,   

    pub token_program : Program<'info, Token>,
    pub system_program : Program<'info, System>
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(signer)]
    pub owner: AccountInfo<'info>,

    #[account(
        mut,
        has_one = owner
    )]
    pub token_staker: Account<'info, TokenStaker>,

    #[account(
        mut,
        constraint = dest_token_account.mint == token_mint.key(),
        constraint = dest_token_account.owner == *owner.key
    )]
    pub dest_token_account: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = token_vault_account.mint == token_mint.key()
    )]
    pub token_vault_account: Account<'info, TokenAccount>, 
    pub token_program : Program<'info, Token>,
    pub vault_authority: AccountInfo<'info>
}

#[account]
#[derive(Default)]
pub struct TokenStaker {
    pub owner: Pubkey,
    pub staked_amount: u64,
    pub unlock_time: u64
}
impl<'info> Initialize<'info> {
    fn into_set_authority_context(&self) -> CpiContext<'_,'_,'_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.vault_account.to_account_info().clone(),
            current_authority: self.owner.to_account_info().clone(),
        };
        CpiContext::new(self.token_program.to_account_info().clone(), cpi_accounts)
    }
}
impl<'info> Deposit<'info> {
    fn into_token_transfer_context(
        &self
    ) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.source_token_account.to_account_info().clone(),
            to: self.token_vault_account.to_account_info().clone(),
            authority: self.owner.to_account_info().clone(),
        };
        CpiContext::new(self.token_program.to_account_info().clone(), cpi_accounts)
    }
}
impl<'info> Withdraw<'info> {
    fn into_token_transfer_context(
        &self
    ) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.token_vault_account.to_account_info().clone(),
            to: self.dest_token_account.to_account_info().clone(),
            authority: self.vault_authority.clone(),
        };
        CpiContext::new(self.token_program.to_account_info().clone(), cpi_accounts)
    }
}

#[error]
pub enum CustomError {
    #[msg("Token still locked!")]
    Locked,
    #[msg("Token amount exceed!")]
    ExceedAmount

}