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

  it('falls back to the region default tag when no tag is given', () => {
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Faker' } });
    fireEvent.click(screen.getByText('Search'));
    expect(push).toHaveBeenCalledWith('/na1/Faker-NA1');
  });

  it('uses the selected region default tag for bare names', () => {
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'kr' } });
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Faker' } });
    fireEvent.click(screen.getByText('Search'));
    expect(push).toHaveBeenCalledWith('/kr/Faker-KR1');
  });

  it('still rejects input with an empty tag after the separator', () => {
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Faker#' } });
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

  it('escapes hyphens within the game name so the separator stays unambiguous', () => {
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Foo-Bar#NA1' } });
    fireEvent.click(screen.getByText('Search'));
    expect(push).toHaveBeenCalledWith('/na1/Foo%2DBar-NA1');
  });
});
