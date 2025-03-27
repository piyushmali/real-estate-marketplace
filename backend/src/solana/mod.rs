use solana_rpc_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

pub struct SolanaClient {
    rpc: RpcClient,
    program_id: Pubkey,
}

impl SolanaClient {
    pub fn new(rpc_url: &str, program_id: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let rpc = RpcClient::new(rpc_url.to_string());
        let program_id = Pubkey::from_str(program_id)?;
        Ok(Self { rpc, program_id })
    }

    pub fn get_program_id(&self) -> Pubkey {
        self.program_id
    }

    pub fn get_program_account_data_len(&self) -> Result<usize, Box<dyn std::error::Error>> {
        let account = self.rpc.get_account(&self.program_id)?;
        Ok(account.data.len())
    }

    pub fn list_property(&self, property_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("Mock: Listing property {} on Solana", property_id);
        Ok(())
    }

    pub fn make_offer(&self, property_id: &str, amount: i64) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("Mock: Making offer for property {} with amount {}", property_id, amount);
        Ok(())
    }

    pub fn respond_to_offer(&self, offer_id: i32, accept: bool) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("Mock: Responding to offer {} with accept: {}", offer_id, accept);
        Ok(())
    }

    pub fn finalize_sale(&self, property_id: &str, offer_id: i32) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("Mock: Finalizing sale for property {} with offer {}", property_id, offer_id);
        Ok(())
    }
}