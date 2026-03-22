import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LargeTitle } from './LargeTitle';

describe('LargeTitle', () => {
  it('제목 텍스트를 h1으로 렌더링', () => {
    render(<LargeTitle title="그룹" />);
    expect(screen.getByRole('heading', { name: '그룹', level: 1 })).toBeInTheDocument();
  });

  it('text-hig-title1 클래스 적용', () => {
    render(<LargeTitle title="코스" />);
    expect(screen.getByRole('heading', { name: '코스', level: 1 })).toHaveClass('text-hig-title1');
  });
});
