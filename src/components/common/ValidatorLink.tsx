import useValidatorPath from 'hooks/useValidatorPath';
import { ComponentProps } from 'react';
import { Link } from 'react-router';

/**
 * A link to a validator's page from either of its keys: its vote account
 * (the canonical URL) when the directory knows the key, else the key as
 * given. `rest` is the tab path after it ("/fees").
 */
const ValidatorLink = ({
  address,
  rest = '',
  ...props
}: Omit<ComponentProps<typeof Link>, 'to'> & {
  address: string;
  rest?: string;
}) => {
  const path = useValidatorPath();
  return <Link to={path(address, rest)} {...props} />;
};

export default ValidatorLink;
