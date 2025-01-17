interface PluginMessage {
    type: string;
    tableData: string;
    fgColor: string;
    bgColor: string;
    tablePrefix: string;
    tableSuffix: string;
    transparentBg: boolean;
}

figma.showUI(__html__, { width: 400, height: 600 });

figma.ui.onmessage = async (msg: PluginMessage) => {
    if (msg.type === 'generate-qr-codes') {
        // Assuming the user has selected a frame as the base design template
        const selectedNodes = figma.currentPage.selection;
        if (selectedNodes.length !== 1 || selectedNodes[0].type !== "FRAME") {
            figma.notify('Please select a single frame as the base design template.', { error: true, timeout: 3000 });
            return;
        }

        const baseTemplate = selectedNodes[0] as FrameNode;

        // Check for bitmaps/images in the baseTemplate
        const hasBitmaps = checkForBitmaps(baseTemplate);
        if (hasBitmaps) {
            figma.notify('Your design contains bitmaps/images. For best printing results, please use vector versions of all elements, including the logotype.', { error: true, timeout: 10000 });
        }

        const lines = msg.tableData.trim().split('\n');
        let row = 0;
        let column = 0;
        const qrPerRow = 10;
        const padding = 20; // Adjust padding between frames as needed

        for (const line of lines) {
            let [tableNumber, qrUrl] = line.split(',');

            // Apply prefix and suffix
            tableNumber = msg.tablePrefix + tableNumber + msg.tableSuffix;

            const bgColor = msg.bgColor.replace("#", "");
            const fgColor = msg.fgColor.replace("#", "");

            // Adjust the apiUrl to consider transparency
            const bgColorParam = msg.transparentBg ? "rgba(0,0,0,0)" : encodeURIComponent(bgColor);

            const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrUrl)}&format=svg&color=${encodeURIComponent(fgColor)}&bgcolor=${bgColorParam}`;

            try {
                const response = await fetch(apiUrl);
                const svgData = await response.text();
                const qrCodeNode = await figma.createNodeFromSvg(svgData);

                // Clone the base template for each QR code
                const clonedTemplate = baseTemplate.clone();
                clonedTemplate.name = tableNumber; // Name the frame with the table number

                // Find the QRCODE square in the cloned template
                const qrCodeSquare = clonedTemplate.findOne(n => n.name === "QRCODE") as RectangleNode;

                if (qrCodeSquare) {
                    // Position and resize the QR code to fill the QRCODE square
                    qrCodeNode.x = qrCodeSquare.x;
                    qrCodeNode.y = qrCodeSquare.y;
                    qrCodeNode.resize(qrCodeSquare.width, qrCodeSquare.height);
                    clonedTemplate.appendChild(qrCodeNode);

                    // Remove the placeholder QRCODE square
                    qrCodeSquare.remove();
                }

                // Update for TABLENAME object replacement
                const tableNameText = clonedTemplate.findOne(n => n.name === "TABLENAME") as TextNode;
                if (tableNameText && tableNameText.type === "TEXT") {
                    await figma.loadFontAsync(tableNameText.fontName as FontName);
                    tableNameText.characters = tableNumber; // Now includes prefix and suffix
                }

                // New code: Flatten all text nodes in the clonedTemplate
                console.log(`Starting to flatten text nodes in clonedTemplate for table number: ${tableNumber}`);
                await flattenAllText(clonedTemplate);
                console.log(`Finished flattening text nodes in clonedTemplate for table number: ${tableNumber}`);

                // Positioning cloned templates as a grid
                clonedTemplate.x = (clonedTemplate.width + padding) * column;
                clonedTemplate.y = (clonedTemplate.height + padding) * row;
                figma.currentPage.appendChild(clonedTemplate);

                column++;
                if (column >= qrPerRow) {
                    column = 0;
                    row++;
                }
            } catch (error) {
                figma.notify(`Failed to generate QR code for table number ${tableNumber}.`, { timeout: 3000 });
                console.error(`Failed to generate QR code for table number ${tableNumber}:`, error);
            }
        }
    }
};

// New function to flatten all text nodes in a given node and its children
async function flattenAllText(node: SceneNode) {
    if ("children" in node) {
        for (const child of [...node.children]) {
            if (child.type === "TEXT") {
                console.log(`Flattening text node: ${child.name}`);
                figma.flatten([child]);
            } else {
                await flattenAllText(child);
            }
        }
    }
}

// Function to check for bitmaps/images in a given node and its children
function checkForBitmaps(node: SceneNode): boolean {
    let hasBitmaps = false;
    if ("children" in node) {
        for (const child of [...node.children]) {
            if (child.type === "RECTANGLE" && child.isAsset) {
                console.log(`Found bitmap/image node: ${child.name}`);
                hasBitmaps = true;
            } else {
                console.log(`Found ${child.type} ${child.isAsset} node: ${child.name}`);
                hasBitmaps = checkForBitmaps(child) || hasBitmaps;
            }
        }
    }
    return hasBitmaps;
}