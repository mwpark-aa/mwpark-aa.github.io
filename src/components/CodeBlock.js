import React from "react";
import {Prism as SyntaxHighlighter} from "react-syntax-highlighter";
import {dracula} from "react-syntax-highlighter/dist/esm/styles/prism"; // 다크 테마 적용

const CodeBlock = ({language = "javascript", children}) => {
    return (
        <SyntaxHighlighter language={language} style={dracula} wrapLongLines>
            {children}
        </SyntaxHighlighter>
    );
};

export default CodeBlock;