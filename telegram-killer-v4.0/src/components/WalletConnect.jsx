/**
 * WalletConnect Component
 * Handles wallet connection using Wagmi
 */

import React from 'react';
import { useConnect } from 'wagmi';

function WalletConnect() {
  const { connectors, connect, isPending, error } = useConnect();

  const handleConnect = (connector) => {
    connect({ connector });
  };

  return (
    <div className="wallet-connect">
      <div className="wallet-buttons">
        {connectors.map((connector) => (
          <button
            key={connector.id}
            onClick={() => handleConnect(connector)}
            disabled={isPending}
            className="wallet-button"
          >
            {isPending ? 'Connecting...' : `Connect ${connector.name}`}
          </button>
        ))}
      </div>
      
      {error && (
        <div className="wallet-error">
          <strong>Connection Error:</strong> {error.message}
        </div>
      )}
    </div>
  );
}

export default WalletConnect;
