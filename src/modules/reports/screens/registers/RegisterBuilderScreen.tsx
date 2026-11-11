import { useParams } from 'react-router-dom';
import { RegisterBuilder } from '@/modules/reports/registers';

export const RegisterBuilderScreen = () => {
  const { id } = useParams();
  return <RegisterBuilder key={id ?? 'new'} registerId={id} />;
};
