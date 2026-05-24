import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginDialog } from '../components/ui/LoginDialog';
import { useAuth } from '../context/AuthContext';

const RegisterPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      if (user.onboardingComplete) {
        navigate('/dashboard');
      } else {
        navigate('/onboarding');
      }
    }
  }, [user, navigate]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      navigate('/');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <LoginDialog open={true} onOpenChange={handleOpenChange} defaultIsLogin={false} />
    </div>
  );
};

export default RegisterPage;
