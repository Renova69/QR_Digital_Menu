import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders home page', () => {
  render(<App />);
  const linkElement = screen.getByText(/Welcome to the QR Menu application!/i);
  expect(linkElement).toBeDefined();
});
