import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

// Mock useRouter with redirect behavior
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

describe('HomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the homepage title and subtitle', () => {
    render(<HomePage />);
    expect(screen.getByText('app.title')).toBeInTheDocument();
    expect(screen.getByText('app.subtitle')).toBeInTheDocument();
  });

  it('renders register and login links', () => {
    render(<HomePage />);
    expect(screen.getByText('auth.register')).toBeInTheDocument();
    expect(screen.getByText('auth.login')).toBeInTheDocument();
  });

  it('has correct link hrefs', () => {
    render(<HomePage />);
    const registerLink = screen.getByText('auth.register').closest('a');
    const loginLink = screen.getByText('auth.login').closest('a');
    expect(registerLink).toHaveAttribute('href', '/auth/register');
    expect(loginLink).toHaveAttribute('href', '/auth/login');
  });
});
