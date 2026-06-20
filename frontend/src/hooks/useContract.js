import { useState, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { Contract } from 'ethers';

export function useContract(address, abi) {
  const { signer, provider } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getContract = useCallback((withSigner = true) => {
    if (!address || !abi) return null;
    const signerOrProvider = withSigner && signer ? signer : provider;
    if (!signerOrProvider) return null;
    return new Contract(address, abi, signerOrProvider);
  }, [address, abi, signer, provider]);

  const execute = useCallback(async (methodName, ...args) => {
    const contract = getContract(true);
    if (!contract) {
      throw new Error('Contract not available. Please connect your wallet.');
    }

    setLoading(true);
    setError(null);

    try {
      const tx = await contract[methodName](...args);
      if (tx.wait) {
        const receipt = await tx.wait();
        return receipt;
      }
      return tx;
    } catch (err) {
      const message = err.reason || err.message || 'Transaction failed';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [getContract]);

  const read = useCallback(async (methodName, ...args) => {
    const contract = getContract(false);
    if (!contract) {
      throw new Error('Contract not available. Please connect your wallet.');
    }

    try {
      return await contract[methodName](...args);
    } catch (err) {
      const message = err.reason || err.message || 'Read failed';
      setError(message);
      throw new Error(message);
    }
  }, [getContract]);

  return {
    contract: getContract(true),
    readContract: getContract(false),
    execute,
    read,
    loading,
    error,
  };
}

export default useContract;
