import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavigationBar } from './NavigationBar';

describe('NavigationBar', () => {
  it('제목 텍스트 렌더링', () => {
    render(<NavigationBar title="그룹 설정" onBack={vi.fn()} />);
    expect(screen.getByText('그룹 설정')).toBeInTheDocument();
  });

  it('뒤로 버튼 클릭 시 onBack 호출', () => {
    const onBack = vi.fn();
    render(<NavigationBar title="테스트" onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /뒤로/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('rightAction이 전달되면 우측 슬롯에 렌더링', () => {
    render(
      <NavigationBar
        title="테스트"
        onBack={vi.fn()}
        rightAction={<button>설정</button>}
      />
    );
    expect(screen.getByRole('button', { name: '설정' })).toBeInTheDocument();
  });

  it('overlay=true이면 absolute 클래스 포함', () => {
    const { container } = render(
      <NavigationBar title="테스트" onBack={vi.fn()} overlay />
    );
    expect(container.firstChild).toHaveClass('absolute');
  });

  it('overlay=false(기본값)이면 absolute 클래스 없음', () => {
    const { container } = render(
      <NavigationBar title="테스트" onBack={vi.fn()} />
    );
    expect(container.firstChild).not.toHaveClass('absolute');
  });
});
