import { VortexDataContext } from 'providers/VortexDataProvider';
import { useCallback, useContext } from 'react';

/**
 * A validator page's path from either of its keys: by its vote account
 * (the canonical URL; identities rotate) when the directory knows the
 * key, else the key as given. `rest` is the tab path after it
 * ("/fees", "/voting/epoch/1072").
 */
const useValidatorPath = () => {
  const dir = useContext(VortexDataContext)?.validatorDirectoryState;
  return useCallback(
    (key: string, rest = '') =>
      `/validator/${dir?.byNodeAddress.get(key)?.voteAddress ?? key}${rest}`,
    [dir]
  );
};

export default useValidatorPath;
