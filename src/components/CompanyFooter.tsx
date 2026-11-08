const CompanyFooter: React.FC = () => {
  return (
    <div className="mt-8 text-center text-sm text-muted-foreground">
      <p>
                Created by{' '}
        <a
          href="https://songerconsulting.se"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
                    Songer Consulting AB
        </a>
      </p>
    </div>
  );
};

export default CompanyFooter;