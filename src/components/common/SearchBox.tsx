import { faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { InputHTMLAttributes } from 'react';

/**
 * A search input that filters as you type. Enter just leaves the field
 * (there is nothing to submit; a form submit would reload the page).
 */
const SearchBox = ({
  placeholder = 'Search',
  className,
  ...input
}: InputHTMLAttributes<HTMLInputElement>) => (
  <div className={['search-field', className].filter(Boolean).join(' ')}>
    <FontAwesomeIcon icon={faSearch} className="search-field-icon" />
    <input
      type="search"
      className="form-control form-control-sm"
      placeholder={placeholder}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      {...input}
    />
  </div>
);

export default SearchBox;
