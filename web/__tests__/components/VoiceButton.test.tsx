import { render, screen, fireEvent } from '@testing-library/react';
import VoiceButton from '@/components/VoiceButton';

describe('VoiceButton', () => {
  const mockOnResult = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the microphone button', () => {
    render(<VoiceButton onResult={mockOnResult} />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('🎤');
  });

  it('has the correct default styling', () => {
    render(<VoiceButton onResult={mockOnResult} />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-primary');
    expect(button.className).not.toContain('animate-pulse');
  });

  it('accepts clienti prop', () => {
    const clienti = [{ id: '1', name: 'Test Client' }];
    render(<VoiceButton onResult={mockOnResult} clienti={clienti} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
