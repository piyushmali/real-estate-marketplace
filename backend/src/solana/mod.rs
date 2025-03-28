use anchor_client::{Client, Cluster};
use anchor_lang::prelude::*; // For Pubkey and AnchorSerialize
use solana_sdk::{
    commitment_config::CommitmentConfig,
    instruction::Instruction,
    signature::{Keypair, Signer},
    system_program,
    sysvar::rent,
};
use std::rc::Rc;
use std::str::FromStr;
use serde::{Serialize, Deserialize};
use bs58;
use bincode;
use spl_token as spl_token_program;
use spl_associated_token_account;

#[derive(Debug)]
pub enum SolanaError {
    AnchorClient(anchor_client::ClientError),
    ParsePubkey(solana_sdk::pubkey::ParsePubkeyError),
    Bincode(Box<bincode::ErrorKind>),
    Anchor(anchor_lang::error::Error),
    Io(std::io::Error),
}

impl From<anchor_client::ClientError> for SolanaError {
    fn from(err: anchor_client::ClientError) -> Self {
        SolanaError::AnchorClient(err)
    }
}

impl From<solana_sdk::pubkey::ParsePubkeyError> for SolanaError {
    fn from(err: solana_sdk::pubkey::ParsePubkeyError) -> Self {
        SolanaError::ParsePubkey(err)
    }
}

impl From<Box<bincode::ErrorKind>> for SolanaError {
    fn from(err: Box<bincode::ErrorKind>) -> Self {
        SolanaError::Bincode(err)
    }
}

impl From<anchor_lang::error::Error> for SolanaError {
    fn from(err: anchor_lang::error::Error) -> Self {
        SolanaError::Anchor(err)
    }
}

impl From<std::io::Error> for SolanaError {
    fn from(err: std::io::Error) -> Self {
        SolanaError::Io(err)
    }
}

impl std::fmt::Display for SolanaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SolanaError::AnchorClient(e) => write!(f, "Anchor client error: {:?}", e),
            SolanaError::ParsePubkey(e) => write!(f, "Pubkey parse error: {}", e),
            SolanaError::Bincode(e) => write!(f, "Bincode error: {:?}", e),
            SolanaError::Anchor(e) => write!(f, "Anchor error: {}", e),
            SolanaError::Io(e) => write!(f, "IO error: {}", e),
        }
    }
}

impl std::error::Error for SolanaError {}

#[derive(AnchorSerialize)]
struct ListPropertyArgs {
    property_id: String,
    price: u64,
    metadata_uri: String,
    location: String,
    square_feet: u64,
    bedrooms: u8,
    bathrooms: u8,
}

#[derive(AnchorSerialize)]
struct MakeOfferArgs {
    offer_amount: u64,
    expiration_time: i64,
}

#[derive(AnchorSerialize)]
struct RespondToOfferArgs {
    accept: bool,
}

#[derive(AnchorSerialize)]
struct ExecuteSaleArgs {}

pub struct SolanaClient {
    client: Client<Rc<Keypair>>,
    program_id: Pubkey,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TransactionResponse {
    pub transaction: String, // Base58-encoded transaction
    pub message: String,    // Instructions for the client
}

impl SolanaClient {
    pub fn new(rpc_url: &str, program_id: &str) -> std::result::Result<Self, SolanaError> {
        let payer = Rc::new(Keypair::new()); // Dummy payer; real signing happens client-side
        let client = Client::new_with_options(
            Cluster::Custom(rpc_url.to_string(), "".to_string()),
            payer,
            CommitmentConfig::confirmed(),
        );
        let program_id = Pubkey::from_str(program_id)?;
        Ok(Self { client, program_id })
    }

    pub fn get_program_id(&self) -> Pubkey {
        self.program_id
    }

    pub fn list_property(
        &self,
        property_data: &super::models::NewProperty,
        owner_pubkey: &str,
    ) -> std::result::Result<TransactionResponse, SolanaError> {
        log::info!("Preparing list_property for {:?}", property_data);
        let program = self.client.program(self.program_id)?;
        let owner = Pubkey::from_str(owner_pubkey)?;
        let (marketplace_pda, _) = Pubkey::find_program_address(
            &[b"marketplace", owner.as_ref()],
            &self.program_id,
        );
        let (property_pda, _) = Pubkey::find_program_address(
            &[b"property", marketplace_pda.as_ref(), property_data.property_id.as_bytes()],
            &self.program_id,
        );
        let nft_mint = Keypair::new();

        let args = ListPropertyArgs {
            property_id: property_data.property_id.clone(),
            price: property_data.price as u64,
            metadata_uri: property_data.metadata_uri.clone(),
            location: property_data.location.clone(),
            square_feet: property_data.square_feet as u64,
            bedrooms: property_data.bedrooms as u8,
            bathrooms: property_data.bathrooms as u8,
        };

        let ix = Instruction {
            program_id: self.program_id,
            accounts: vec![
                AccountMeta::new(marketplace_pda, false),
                AccountMeta::new(property_pda, false),
                AccountMeta::new(owner, true),
                AccountMeta::new(nft_mint.pubkey(), false),
                AccountMeta::new(Pubkey::default(), false), // owner_nft_account placeholder
                AccountMeta::new_readonly(system_program::id(), false),
                AccountMeta::new_readonly(spl_token_program::id(), false),
                AccountMeta::new_readonly(spl_associated_token_account::id(), false),
                AccountMeta::new_readonly(rent::id(), false),
            ],
            data: args.try_to_vec()?, // Serialize using borsh
        };

        let tx = program
            .request()
            .instruction(ix)
            .transaction()?;

        let tx_serialized = bs58::encode(bincode::serialize(&tx)?).into_string();
        Ok(TransactionResponse {
            transaction: tx_serialized,
            message: "Sign and submit this transaction with your wallet (e.g., Phantom)".to_string(),
        })
    }

    pub fn make_offer(
        &self,
        property_id: &str,
        amount: i64,
        expiration_time: i64,
        buyer_pubkey: &str,
    ) -> std::result::Result<TransactionResponse, SolanaError> {
        log::info!("Preparing make_offer for property_id: {}", property_id);
        let program = self.client.program(self.program_id)?;
        let buyer = Pubkey::from_str(buyer_pubkey)?;
        let property_key = Pubkey::from_str(property_id)?;
        let (offer_pda, _) = Pubkey::find_program_address(
            &[b"offer", property_key.as_ref(), buyer.as_ref()],
            &self.program_id,
        );

        let args = MakeOfferArgs {
            offer_amount: amount as u64,
            expiration_time,
        };

        let ix = Instruction {
            program_id: self.program_id,
            accounts: vec![
                AccountMeta::new_readonly(property_key, false),
                AccountMeta::new(offer_pda, false),
                AccountMeta::new(buyer, true),
                AccountMeta::new_readonly(system_program::id(), false),
                AccountMeta::new_readonly(rent::id(), false),
            ],
            data: args.try_to_vec()?,
        };

        let tx = program
            .request()
            .instruction(ix)
            .transaction()?;

        let tx_serialized = bs58::encode(bincode::serialize(&tx)?).into_string();
        Ok(TransactionResponse {
            transaction: tx_serialized,
            message: "Sign and submit this transaction with your wallet".to_string(),
        })
    }

    pub fn respond_to_offer(
        &self,
        offer_id: i32,
        accept: bool,
        owner_pubkey: &str,
    ) -> std::result::Result<TransactionResponse, SolanaError> {
        log::info!("Preparing respond_to_offer for offer_id: {}, accept: {}", offer_id, accept);
        let program = self.client.program(self.program_id)?;
        let owner = Pubkey::from_str(owner_pubkey)?;
        let offer_key = Pubkey::from_str(&format!("offer{}", offer_id))?; // Placeholder

        let args = RespondToOfferArgs { accept };

        let ix = Instruction {
            program_id: self.program_id,
            accounts: vec![
                AccountMeta::new(Pubkey::default(), false), // property placeholder
                AccountMeta::new(offer_key, false),
                AccountMeta::new(owner, true),
            ],
            data: args.try_to_vec()?,
        };

        let tx = program
            .request()
            .instruction(ix)
            .transaction()?;

        let tx_serialized = bs58::encode(bincode::serialize(&tx)?).into_string();
        Ok(TransactionResponse {
            transaction: tx_serialized,
            message: "Sign and submit this transaction with your wallet".to_string(),
        })
    }

    pub fn finalize_sale(
        &self,
        property_id: &str,
        offer_id: i32,
        buyer_pubkey: &str,
        seller_pubkey: &str,
    ) -> std::result::Result<TransactionResponse, SolanaError> {
        log::info!("Preparing finalize_sale for property_id: {}, offer_id: {}", property_id, offer_id);
        let program = self.client.program(self.program_id)?;
        let buyer = Pubkey::from_str(buyer_pubkey)?;
        let seller = Pubkey::from_str(seller_pubkey)?;
        let property_key = Pubkey::from_str(property_id)?;
        let offer_key = Pubkey::from_str(&format!("offer{}", offer_id))?;
        let (transaction_history_pda, _) = Pubkey::find_program_address(
            &[b"transaction", property_key.as_ref(), &(1_u64).to_le_bytes()], // Placeholder transaction_count
            &self.program_id,
        );

        let args = ExecuteSaleArgs {};

        let ix = Instruction {
            program_id: self.program_id,
            accounts: vec![
                AccountMeta::new(Pubkey::default(), false), // marketplace placeholder
                AccountMeta::new(property_key, false),
                AccountMeta::new(offer_key, false),
                AccountMeta::new(transaction_history_pda, false),
                AccountMeta::new(buyer, true),
                AccountMeta::new_readonly(seller, true),
                AccountMeta::new(Pubkey::default(), false), // buyer_token_account
                AccountMeta::new(Pubkey::default(), false), // seller_token_account
                AccountMeta::new(Pubkey::default(), false), // marketplace_fee_account
                AccountMeta::new(Pubkey::default(), false), // seller_nft_account
                AccountMeta::new(Pubkey::default(), false), // buyer_nft_account
                AccountMeta::new(Pubkey::default(), false), // property_nft_mint
                AccountMeta::new_readonly(spl_token_program::id(), false),
                AccountMeta::new_readonly(spl_associated_token_account::id(), false),
                AccountMeta::new_readonly(system_program::id(), false),
                AccountMeta::new_readonly(rent::id(), false),
            ],
            data: args.try_to_vec()?,
        };

        let tx = program
            .request()
            .instruction(ix)
            .transaction()?;

        let tx_serialized = bs58::encode(bincode::serialize(&tx)?).into_string();
        Ok(TransactionResponse {
            transaction: tx_serialized,
            message: "Sign and submit this transaction with your wallet".to_string(),
        })
    }
}