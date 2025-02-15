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
                    style={{
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                    }}
                    onClick={toggleExpand}
                >
                    <span>{title}</span>
                    {isExpanded ? (
                        <ExpandLess style={{marginLeft: "8px"}}/>
                    ) : (
                        <ExpandMore style={{marginLeft: "8px"}}/>
                    )}
                </Box>
            </Component>
            <Collapse in={isExpanded}>
                <Box style={{paddingLeft: "45px", paddingTop: "8px", paddingBottom: "8px"}}>
                    {children}
                </Box>
            </Collapse>
        </Box>
    );
};

export default ExpandableBox;
