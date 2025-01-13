const CompanyFooter: React.FC = () => {
  return (
    <div className="text-center mt-8 text-sm text-gray-500">
      <p>
                Created by{' '}
        <a
          href="https://songerconsulting.se"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline"
        >
                    Songer Consulting AB
        </a>
      </p>
    </div>
  );
};

export default CompanyFooter;