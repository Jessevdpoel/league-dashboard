import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

describe('SearchForm suggestions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function stubFetch(suggestions: { gameName: string; tagLine: string }[]) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions }),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('fetches and shows tag suggestions after the debounce', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch([
      { gameName: 'Faker', tagLine: 'KR1' },
      { gameName: 'Faker', tagLine: 'T1' },
    ]);
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Fak' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/riot-ids/suggest?q=Fak&region=na1');
    expect(screen.getByText('Faker#KR1')).toBeInTheDocument();
    expect(screen.getByText('Faker#T1')).toBeInTheDocument();
  });

  it('navigates to the suggested profile when a suggestion is clicked', async () => {
    vi.useFakeTimers();
    stubFetch([{ gameName: 'Faker', tagLine: 'KR1' }]);
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Fak' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    fireEvent.click(screen.getByText('Faker#KR1'));
    expect(push).toHaveBeenCalledWith('/na1/Faker-KR1');
  });

  it('does not fetch for short input or once a tag separator is typed', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch([]);
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'F' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Faker#KR' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
