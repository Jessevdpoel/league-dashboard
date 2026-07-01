import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchForm } from '../../components/SearchForm';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('SearchForm', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('navigates to the profile route on a valid submit', () => {
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Faker#KR1' } });
    fireEvent.click(screen.getByText('Search'));
    expect(push).toHaveBeenCalledWith('/na1/Faker-KR1');
  });

  it('shows a validation error and does not navigate when the tag is missing', () => {
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Faker' } });
    fireEvent.click(screen.getByText('Search'));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a Riot ID');
    expect(push).not.toHaveBeenCalled();
  });

  it('navigates using the selected region', () => {
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'euw1' } });
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Foo#Bar' } });
    fireEvent.click(screen.getByText('Search'));
    expect(push).toHaveBeenCalledWith('/euw1/Foo-Bar');
  });
});
