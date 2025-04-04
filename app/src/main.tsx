import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { PropertyProvider } from './context/PropertyContext'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from './components/ui/toaster'
import { ToastProvider } from './components/ui/use-toast'

// Solana wallet imports
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { clusterApiUrl } from '@solana/web3.js'

// Stylesheet for wallet components
import '@solana/wallet-adapter-react-ui/styles.css'

// Setup Solana network and wallet adapters
const network = WalletAdapterNetwork.Devnet
const endpoint = import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl(network)
// Remove PhantomWalletAdapter since it's automatically detected
const wallets = [new SolflareWalletAdapter({ network })]

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <ToastProvider>
              <PropertyProvider>
                <App />
                <Toaster />
              </PropertyProvider>
            </ToastProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
