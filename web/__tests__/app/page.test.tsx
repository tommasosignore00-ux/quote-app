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
    // La homepage ripete titolo e sottotitolo anche nel footer
    expect(screen.getAllByText(/app\.title/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/app\.subtitle/).length).toBeGreaterThan(0);
  });

  it('renders register and login links', () => {
    render(<HomePage />);
    expect(screen.getAllByText('auth.register').length).toBeGreaterThan(0);
    expect(screen.getAllByText('auth.login').length).toBeGreaterThan(0);
  });

  it('has correct link hrefs', () => {
    render(<HomePage />);
    const hrefs = (text: string) =>
      screen.getAllByText(text).map((el) => el.closest('a')?.getAttribute('href'));
    expect(hrefs('auth.register')).toContain('/auth/register');
    expect(hrefs('auth.login')).toContain('/auth/login');
  });
});
