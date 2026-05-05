import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginDialog } from '../components/ui/LoginDialog';
import { useAuth } from '../context/AuthContext';

const LoginPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // The dialog is open by default on this page.
  // When the user closes it, we navigate them back to the home page.
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      navigate('/');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <LoginDialog open={true} onOpenChange={handleOpenChange} />
    </div>
  );
};

export default LoginPage;
