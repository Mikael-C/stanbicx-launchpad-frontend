import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { BrowserProvider, formatEther } from 'ethers';

const WalletContext = createContext(null);

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [balance, setBalance] = useState('0');
  const [isConnecting, setIsConnecting] = useState(false);

  const isConnected = !!account;

  const updateBalance = useCallback(async (prov, addr) => {
    if (!prov || !addr) return;
    try {
      const bal = await prov.getBalance(addr);
      setBalance(formatEther(bal));
    } catch (err) {
      console.error('Failed to get balance:', err);
    }
  }, []);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
    }

    setIsConnecting(true);
    try {
      const browserProvider = new BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send('eth_requestAccounts', []);
      const walletSigner = await browserProvider.getSigner();
      const network = await browserProvider.getNetwork();

      const addr = accounts[0];
      setProvider(browserProvider);
      setSigner(walletSigner);
      setAccount(addr);
      setChainId(Number(network.chainId));

      await updateBalance(browserProvider, addr);

      localStorage.setItem('sx_wallet_connected', 'true');
      return addr;
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [updateBalance]);

  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setChainId(null);
    setBalance('0');
    localStorage.removeItem('sx_wallet_connected');
  }, []);

  const refreshBalance = useCallback(() => {
    if (provider && account) {
      updateBalance(provider, account);
    }
  }, [provider, account, updateBalance]);

  // Auto-reconnect on mount
  useEffect(() => {
    const wasConnected = localStorage.getItem('sx_wallet_connected');
    if (wasConnected === 'true' && window.ethereum) {
      connectWallet().catch(() => {
        localStorage.removeItem('sx_wallet_connected');
      });
    }
  }, [connectWallet]);

  // Listen for account / network changes
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        setAccount(accounts[0]);
        if (provider) {
          updateBalance(provider, accounts[0]);
        }
      }
    };

    const handleChainChanged = (chainIdHex) => {
      setChainId(Number(chainIdHex));
      // Re-create provider on chain change
      if (account) {
        const newProvider = new BrowserProvider(window.ethereum);
        setProvider(newProvider);
        newProvider.getSigner().then(setSigner);
        updateBalance(newProvider, account);
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [account, provider, disconnectWallet, updateBalance]);

  // Periodic balance refresh
  useEffect(() => {
    if (!provider || !account) return;
    const interval = setInterval(() => {
      updateBalance(provider, account);
    }, 15000);
    return () => clearInterval(interval);
  }, [provider, account, updateBalance]);

  const value = {
    account,
    provider,
    signer,
    chainId,
    balance,
    isConnected,
    isConnecting,
    connectWallet,
    disconnectWallet,
    refreshBalance,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export default WalletContext;
