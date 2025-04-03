import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWallet } from '@/hooks/useWallet';

interface Transaction {
  id: string;
  property: {
    id: string;
    location: string;
  };
  seller: string;
  buyer: string;
  price: number;
  timestamp: string;
  transaction_index: number;
}

const TransactionHistory = () => {
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58();

  // TODO: Fetch user's transaction history
  const transactions: Transaction[] = [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Transaction History</h1>

      {transactions.length > 0 ? (
        <div className="grid gap-6">
          {transactions.map((transaction) => (
            <Card key={transaction.id}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Property Transaction #{transaction.transaction_index}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Property Location:</span>
                      <span className="ml-2">{transaction.property.location}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Price:</span>
                      <span className="ml-2">{transaction.price} SOL</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Role:</span>
                      <span className="ml-2">
                        {transaction.seller === walletAddress ? 'Seller' : 'Buyer'}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Date:</span>
                      <span className="ml-2">
                        {new Date(transaction.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Seller:</span>
                      <span className="ml-2 font-mono">{transaction.seller}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Buyer:</span>
                      <span className="ml-2 font-mono">{transaction.buyer}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              You haven't participated in any property transactions yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TransactionHistory;