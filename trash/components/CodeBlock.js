import React from "react";
import {Prism as SyntaxHighlighter} from "react-syntax-highlighter";


const CodeBlock = ({language = "javascript", children}) => {
    return (
        <SyntaxHighlighter language={language} wrapLongLines>
            {children}
        </SyntaxHighlighter>
    );
};

export default CodeBlock;