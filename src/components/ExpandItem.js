import React, {useState} from "react";
import {ExpandMore, ExpandLess} from "@mui/icons-material";
import {Box, Collapse} from "@mui/material";

const ExpandableBox = ({title, children, component: Component = Box, ...props}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const toggleExpand = () => {
        setIsExpanded(!isExpanded);
    };

    return (
        <Box>
            <Component {...props}>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                    }}
                    onClick={toggleExpand}
                >
                    <span>{title}</span>
                    {isExpanded ? (
                        <ExpandLess sx={{marginLeft: "8px"}}/>
                    ) : (
                        <ExpandMore sx={{marginLeft: "8px"}}/>
                    )}
                </Box>
            </Component>
            <Collapse in={isExpanded}>
                <Box sx={{paddingLeft: {lg: "45px"}, paddingTop: "8px", paddingBottom: "8px"}}>
                    {children}
                </Box>
            </Collapse>
        </Box>
    );
};

export default ExpandableBox;
