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

    // Mock functions (replace with real Anchor calls later)
    pub fn list_property(&self, _property_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("Mock: Listing property {} on Solana", _property_id);
        Ok(())
    }

    pub fn make_offer(&self, _property_id: &str, _amount: i64) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("Mock: Making offer for property {} with amount {}", _property_id, _amount);
        Ok(())
    }
}