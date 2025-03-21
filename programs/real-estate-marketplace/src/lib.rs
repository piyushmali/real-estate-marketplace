use anchor_lang::prelude::*;

declare_id!("EcPni58apii69R7PstXNThzv44dTYdprEV1HzkjT3DbE");

#[program]
pub mod real_estate_marketplace {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
