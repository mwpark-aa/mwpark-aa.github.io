import React from "react";
import { Container, Typography, Box, Link } from "@mui/material";

const Contact = () => {
    return (
        <Container sx={{ mt: 4, textAlign: "center" }}>
            <Typography variant="h4" gutterBottom>📬 연락처</Typography>
            <Typography>Email: <Link href="mailto:your.email@example.com">your.email@example.com</Link></Typography>
            <Typography>GitHub: <Link href="https://github.com/yourusername" target="_blank">github.com/yourusername</Link></Typography>
            <Typography>LinkedIn: <Link href="https://linkedin.com/in/yourusername" target="_blank">linkedin.com/in/yourusername</Link></Typography>
        </Container>
    );
};

export default Contact;
