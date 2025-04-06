import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createOffer } from '../../services/offerService';
import { useAuth } from '../../hooks/useAuth';
import { useWallet } from '../../hooks/useWallet';
import { Alert, AlertTitle, Card, CardContent, CardHeader, TextField, Button, Typography, Box, CircularProgress } from '@mui/material';

interface CreateOfferFormProps {
  propertyId: string;
  propertyPrice: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const CreateOfferForm = ({ 
  propertyId, 
  propertyPrice, 
  onSuccess,
  onCancel
}: CreateOfferFormProps) => {
  const { token, isAuthenticated, authenticate } = useAuth();
  const { connected, publicKey } = useWallet();
  const navigate = useNavigate();
  
  const [amount, setAmount] = useState<number>(propertyPrice);
  const [expirationDays, setExpirationDays] = useState<number>(7);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // Check authentication on load
  useEffect(() => {
    if (!isAuthenticated && connected) {
      authenticate();
    }
  }, [isAuthenticated, connected, authenticate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!connected) {
      setError("Please connect your wallet first");
      return;
    }
    
    if (!isAuthenticated) {
      setError("Please authenticate your wallet first");
      try {
        await authenticate();
      } catch (err) {
        return; // Don't proceed if authentication fails
      }
    }

    if (!token) {
      setError("Authentication required");
      return;
    }

    if (amount <= 0) {
      setError("Offer amount must be greater than 0");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      console.log(`Creating offer for property ${propertyId} with amount ${amount} SOL`);
      console.log(`Using wallet: ${publicKey}`);

      const offer = await createOffer(
        propertyId,
        amount,
        expirationDays,
        token
      );

      setSuccess(true);
      console.log("Offer created successfully:", offer);
      
      // Wait a moment to show success message
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          navigate('/my-offers');
        }
      }, 1500);
    } catch (err: any) {
      console.error("Error creating offer:", err);
      setError(err.message || "Failed to create offer. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ maxWidth: '500px', mx: 'auto', mb: 4 }}>
      <CardHeader 
        title="Make an Offer" 
        titleTypographyProps={{ variant: 'h5' }}
      />
      <CardContent>
        {!connected && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Please connect your wallet to make an offer
          </Alert>
        )}
        
        {!isAuthenticated && connected && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Please authenticate your wallet
            <Button 
              variant="outlined" 
              size="small" 
              onClick={authenticate}
              sx={{ ml: 2 }}
            >
              Authenticate
            </Button>
          </Alert>
        )}
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>Error</AlertTitle>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            <AlertTitle>Success!</AlertTitle>
            Your offer has been submitted successfully
          </Alert>
        )}
        
        <form onSubmit={handleSubmit}>
          <TextField
            label="Offer Amount (SOL)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value))}
            fullWidth
            margin="normal"
            required
            inputProps={{ min: 0, step: 0.1 }}
          />
          
          <TextField
            label="Expiration (Days)"
            type="number"
            value={expirationDays}
            onChange={(e) => setExpirationDays(parseInt(e.target.value))}
            fullWidth
            margin="normal"
            required
            inputProps={{ min: 1, max: 30 }}
          />
          
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
            <Button
              variant="outlined"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            
            <Button 
              variant="contained" 
              color="primary" 
              type="submit"
              disabled={isSubmitting || !connected || !isAuthenticated}
            >
              {isSubmitting ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                "Submit Offer"
              )}
            </Button>
          </Box>
        </form>
      </CardContent>
    </Card>
  );
}; 