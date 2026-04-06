import { useNavigate } from 'react-router-dom';

export function useSafeBack(fallback = '/group') {
  const navigate = useNavigate();
  return () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  };
}
